// 站点可用性检查：根据文档分支生成对应的文档站点地址并探测。
// - 域名规则：docs.<分支后缀去下划线>.ufactory.cc
// - 例外：usermanual 使用 docs.ufactory.cc
// - 会跟随 3xx 跳转（根路径常 301 到 /en/ 或 https），以最终页面状态判断
// - 支持通过代理探测：优先 SITE_CHECK_PROXY / https_proxy / http_proxy 环境变量，
//   其次是 config.json 里的 siteProxy，最后复用 gitProxy（容器内通常无法直连外网）
const https = require("https");
const http = require("http");
const tls = require("tls");
const net = require("net");
const configs = require("./configs");

const REQUEST_TIMEOUT = 15 * 1000;
const MAX_REDIRECTS = 5;
const USER_AGENT = "Mozilla/5.0 (compatible; docs-site-check/1.0)";

// 双栈环境下优先尝试可用的地址族（Happy Eyeballs），
// 避免 IPv6 不可达时请求一直挂起直到超时
if (typeof net.setDefaultAutoSelectFamily === "function") {
    net.setDefaultAutoSelectFamily(true);
}

function hostFor(value) {
    if (value === "usermanual") {
        return "docs.ufactory.cc";
    }
    // 域名不允许下划线：support_article -> supportarticle
    return `docs.${String(value).replace(/_/g, "")}.ufactory.cc`;
}

function getProxyUrl() {
    const fromEnv = process.env.SITE_CHECK_PROXY
        || process.env.https_proxy
        || process.env.HTTPS_PROXY
        || process.env.http_proxy
        || process.env.HTTP_PROXY;
    if (fromEnv) {
        return fromEnv;
    }
    const cfg = configs.get();
    return cfg.siteProxy || cfg.gitProxy || "";
}

function parseProxy(proxyUrl) {
    try {
        const url = new URL(proxyUrl);
        return {
            protocol: url.protocol,
            host: url.hostname,
            port: Number(url.port) || 80,
            auth: url.username
                ? `${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`
                : null
        };
    } catch (err) {
        return null;
    }
}

// 通过代理建立 CONNECT 隧道，返回可用的 socket（https 时已套上 TLS）
function openTunnel(target, proxy) {
    return new Promise((resolve) => {
        const targetPort = Number(target.port) || 443;
        const headers = {
            Host: `${target.hostname}:${targetPort}`
        };
        if (proxy.auth) {
            headers["Proxy-Authorization"] = `Basic ${Buffer.from(proxy.auth).toString("base64")}`;
        }

        const req = http.request({
            host: proxy.host,
            port: proxy.port,
            method: "CONNECT",
            path: `${target.hostname}:${targetPort}`,
            headers
        });

        req.setTimeout(REQUEST_TIMEOUT, () => req.destroy(new Error("PROXY_TIMEOUT")));

        req.on("connect", (res, socket) => {
            if (res.statusCode !== 200) {
                socket.destroy();
                return resolve({ error: `PROXY_${res.statusCode}` });
            }
            const tlsSocket = tls.connect({
                socket,
                servername: target.hostname
            }, () => resolve({ socket: tlsSocket }));
            tlsSocket.setTimeout(REQUEST_TIMEOUT, () => tlsSocket.destroy(new Error("TLS_TIMEOUT")));
            tlsSocket.on("error", (err) => resolve({ error: err.code || err.message }));
        });

        req.on("error", (err) => resolve({ error: err.code || err.message }));
        req.end();
    });
}

// 单次请求（不跟随跳转）
function requestOnce(url, proxy) {
    return new Promise((resolve) => {
        const started = Date.now();
        const target = new URL(url);
        const isHttps = target.protocol === "https:";
        let settled = false;

        const done = (result) => {
            if (!settled) {
                settled = true;
                resolve({
                    ...result,
                    ms: Date.now() - started
                });
            }
        };

        const handleResponse = (res) => {
            const result = {
                status: res.statusCode,
                location: res.headers.location || null,
                error: null
            };
            res.resume();
            done(result);
        };

        (async () => {
            if (proxy) {
                if (isHttps) {
                    const tunnel = await openTunnel(target, proxy);
                    if (tunnel.error) {
                        return done({ status: null, location: null, error: tunnel.error });
                    }
                    const agent = new https.Agent({ keepAlive: false });
                    agent.createConnection = (opts, cb) => {
                        cb(null, tunnel.socket);
                        return tunnel.socket;
                    };
                    const req = https.request(url, {
                        agent,
                        headers: { "User-Agent": USER_AGENT, Accept: "text/html" }
                    }, handleResponse);
                    req.setTimeout(REQUEST_TIMEOUT, () => req.destroy(new Error("TIMEOUT")));
                    req.on("error", (err) => done({ status: null, location: null, error: err.code || err.message }));
                    req.end();
                } else {
                    // HTTP 走代理时直接请求绝对 URI
                    const req = http.request({
                        host: proxy.host,
                        port: proxy.port,
                        method: "GET",
                        path: url,
                        headers: {
                            Host: target.host,
                            "User-Agent": USER_AGENT,
                            Accept: "text/html"
                        }
                    }, handleResponse);
                    req.setTimeout(REQUEST_TIMEOUT, () => req.destroy(new Error("TIMEOUT")));
                    req.on("error", (err) => done({ status: null, location: null, error: err.code || err.message }));
                    req.end();
                }
                return;
            }

            const mod = isHttps ? https : http;
            const req = mod.get(url, {
                headers: { "User-Agent": USER_AGENT, Accept: "text/html" }
            }, handleResponse);

            // 自己控制超时：socket 半开时 req.setTimeout 不一定能触发
            const timer = setTimeout(() => {
                req.destroy();
                done({ status: null, location: null, error: "TIMEOUT" });
            }, REQUEST_TIMEOUT);

            req.on("close", () => clearTimeout(timer));
            req.on("error", (err) => {
                clearTimeout(timer);
                done({ status: null, location: null, error: err.code || err.message });
            });
        })().catch((err) => done({ status: null, location: null, error: err.code || err.message }));
    });
}

// 请求并跟随跳转，返回最终状态
async function request(url, proxy) {
    const chain = [];
    let current = url;

    for (let i = 0; i <= MAX_REDIRECTS; i++) {
        const res = await requestOnce(current, proxy);
        chain.push({
            url: current,
            status: res.status,
            location: res.location
        });

        if (res.error || res.status === null) {
            return {
                status: null,
                location: null,
                ms: res.ms,
                error: res.error,
                finalUrl: current,
                chain
            };
        }

        if (res.status >= 300 && res.status < 400 && res.location) {
            try {
                current = new URL(res.location, current).href;
            } catch (err) {
                return {
                    status: null,
                    location: res.location,
                    ms: res.ms,
                    error: "BAD_REDIRECT",
                    finalUrl: current,
                    chain
                };
            }
            continue;
        }

        return {
            status: res.status,
            location: res.location,
            ms: res.ms,
            error: null,
            finalUrl: current,
            chain
        };
    }

    return {
        status: null,
        location: null,
        ms: 0,
        error: "TOO_MANY_REDIRECTS",
        finalUrl: current,
        chain
    };
}

// 超时自动重试一次（慢网络/偶发握手卡住时比较有用）
async function requestWithRetry(url, proxy) {
    const first = await request(url, proxy);
    if (first.error === "TIMEOUT") {
        return request(url, proxy);
    }
    return first;
}

async function checkDoc(doc, proxy) {
    const host = hostFor(doc.value);
    const httpsUrl = `https://${host}/`;
    const httpUrl = `http://${host}/`;

    const [httpsRes, httpRes] = await Promise.all([
        requestWithRetry(httpsUrl, proxy),
        request(httpUrl, proxy)
    ]);

    const httpsOk = httpsRes.status !== null && httpsRes.status < 400;
    const httpOk = httpRes.status !== null && httpRes.status < 400;
    // HTTP 请求最终落在 https:// 上，视为自动跳转 HTTPS
    const httpToHttps = Boolean(httpRes.finalUrl && httpRes.finalUrl.startsWith("https://"));

    let message;
    if (httpsOk) {
        if (httpToHttps) {
            message = "可访问，HTTP 自动跳转 HTTPS";
        } else if (httpOk) {
            message = "可访问，HTTP 未跳转 HTTPS";
        } else {
            message = `可访问（HTTP 不可用：${httpRes.error || `状态码 ${httpRes.status}`}）`;
        }
    } else if (httpOk) {
        message = `仅 HTTP 可访问，HTTPS 不可用：${httpsRes.error || `状态码 ${httpsRes.status}`}`;
    } else {
        message = `无法访问：${httpsRes.error || `状态码 ${httpsRes.status}`}`;
    }

    return {
        value: doc.value,
        label: doc.label,
        branch: doc.branch,
        host,
        url: httpsUrl,
        proxy: proxy ? `${proxy.host}:${proxy.port}` : null,
        reachable: httpsOk || httpOk,
        https: httpsOk,
        httpsStatus: httpsRes.status,
        httpsError: httpsRes.error,
        httpsFinalUrl: httpsRes.finalUrl,
        httpsRedirects: Math.max(0, httpsRes.chain.length - 1),
        httpStatus: httpRes.status,
        httpRedirectToHttps: httpToHttps,
        latency: httpsOk ? httpsRes.ms : (httpOk ? httpRes.ms : Math.max(httpsRes.ms, httpRes.ms)),
        message
    };
}

// 检查所有文档站点
async function checkAll() {
    return checkAllStreaming();
}

// 逐个检查并在每个站点出结果时回调（用于页面边检查边显示）
async function checkAllStreaming(onItem) {
    const docs = configs.get().docs;
    const proxy = parseProxy(getProxyUrl());
    const items = await Promise.all(docs.map(async (doc) => {
        const item = await checkDoc(doc, proxy);
        if (onItem) {
            onItem(item);
        }
        return item;
    }));
    return {
        checkedAt: new Date().toISOString(),
        proxy: proxy ? `${proxy.host}:${proxy.port}` : null,
        items
    };
}

module.exports = {
    checkAll,
    checkAllStreaming,
    hostFor,
    getProxyUrl
};
