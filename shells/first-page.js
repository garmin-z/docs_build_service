#!/usr/bin/env node
// 用法: node first-page.js <文档仓库路径> <输出文件>
//
// 优先加载文档仓库自身的 VitePress 配置（含 vitepress-sidebar 生成的侧边栏），
// 取侧边栏中的第一个链接作为“第一页”；
// 配置文件加载失败时退回按目录规则扫描（数字前缀、introduction.md 优先等）。

const fs = require("fs");
const path = require("path");
const { createRequire } = require("module");
const { pathToFileURL } = require("url");

// 解析包的 package.json（兼容 exports 不暴露 package.json 的包）
function resolvePackageJson(repoRequire, id) {
    try {
        return repoRequire.resolve(`${id}/package.json`);
    } catch (err) {
        const entry = repoRequire.resolve(id);
        let dir = path.dirname(entry);
        for (let i = 0; i < 5; i++) {
            const candidate = path.join(dir, "package.json");
            if (fs.existsSync(candidate)) {
                return candidate;
            }
            dir = path.dirname(dir);
        }
        throw err;
    }
}

// require.resolve 拿到的是 CJS 入口，而 loadConfigFromFile 只在 ESM 构建里提供
function resolveEsmEntry(repoRequire, id) {
    const pkgPath = resolvePackageJson(repoRequire, id);
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

    const pick = (value) => {
        if (typeof value === "string") {
            return value;
        }
        if (value && typeof value === "object") {
            return pick(value.import) || pick(value.default) || pick(value.module);
        }
        return null;
    };

    let entry = null;
    if (typeof pkg.exports === "string") {
        entry = pkg.exports;
    } else if (pkg.exports && pkg.exports["."]) {
        entry = pick(pkg.exports["."]);
    }
    if (!entry) {
        entry = pkg.module || pkg.main;
    }
    if (!entry) {
        throw new Error(`${id} 未找到 ESM 入口`);
    }
    return path.join(path.dirname(pkgPath), entry);
}

// 从 VitePress 配置的侧边栏中取第一个链接
async function loadFirstLinkFromConfig(repoRoot) {
    const repoRequire = createRequire(path.join(repoRoot, "package.json"));

    let viteEntry;
    try {
        viteEntry = resolveEsmEntry(repoRequire, "vite");
    } catch (err) {
        // vite 未被提升到仓库顶层时，改从 vitepress 自身的位置解析
        const vitepressPkg = resolvePackageJson(repoRequire, "vitepress");
        viteEntry = resolveEsmEntry(createRequire(vitepressPkg), "vite");
    }

    const { loadConfigFromFile } = await import(pathToFileURL(viteEntry).href);

    const configFile = [
        ".vitepress/config.mts",
        ".vitepress/config.ts",
        ".vitepress/config.mjs",
        ".vitepress/config.js"
    ]
        .map((p) => path.join(repoRoot, p))
        .find((p) => fs.existsSync(p));

    if (!configFile) {
        throw new Error("未找到 .vitepress 配置文件");
    }

    const loaded = await loadConfigFromFile({
        command: "build",
        mode: "production"
    }, configFile, repoRoot);

    let config = loaded && loaded.config;
    if (typeof config === "function") {
        config = await config({
            command: "build",
            mode: "production"
        });
    }

    const sidebar = config && config.themeConfig && config.themeConfig.sidebar;
    return findFirstLink(sidebar);
}

// 深度优先查找第一个带 link 的侧边栏项（兼容数组、按路径分组、嵌套 items）
function findFirstLink(node) {
    if (!node) {
        return null;
    }
    if (Array.isArray(node)) {
        for (const item of node) {
            const link = findFirstLink(item);
            if (link) {
                return link;
            }
        }
        return null;
    }
    if (typeof node === "object") {
        if (typeof node.link === "string" && node.link) {
            return node.link;
        }
        if (node.items) {
            return findFirstLink(node.items);
        }
        // 按路由分组的 sidebar：{"\/": {...}, "/zhHans/": {...}}
        for (const value of Object.values(node)) {
            const link = findFirstLink(value);
            if (link) {
                return link;
            }
        }
    }
    return null;
}

const MANUAL_PRIORITY_FILES = new Set(["introduction.md", "readme.md", "index.md"]);
const IGNORED_DIRS = new Set(["assets", "public", "node_modules", ".vitepress", ".git"]);
const IGNORED_FILES = new Set(["index.md", "readme.md"]);

// 目录扫描兜底：没有 md 文件就深入第一个子目录，有 md 文件就按侧边栏排序规则取第一个
function scanFirstPage(repoRoot) {
    const enDir = path.join(repoRoot, "en");
    const root = fs.existsSync(enDir) ? enDir : repoRoot;
    const segments = walk(root, []);
    return segments ? segments.join("/") : null;
}

function walk(dir, segments) {
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
        return null;
    }

    entries = entries.filter((entry) => !entry.name.startsWith("."));

    const files = entries
        .filter((entry) => entry.isFile() && /\.md$/i.test(entry.name)
            && !IGNORED_FILES.has(entry.name.toLowerCase()))
        .sort(compareEntries);

    if (files.length > 0) {
        return [...segments, files[0].name];
    }

    const dirs = entries
        .filter((entry) => entry.isDirectory() && !IGNORED_DIRS.has(entry.name.toLowerCase()))
        .sort(compareEntries);

    for (const dirEntry of dirs) {
        const found = walk(path.join(dir, dirEntry.name), [...segments, dirEntry.name]);
        if (found) {
            return found;
        }
    }
    return null;
}

function leadingNumber(name) {
    const match = name.match(/^(\d+)/);
    return match ? parseInt(match[1], 10) : null;
}

// 数字前缀优先按数值排序，其余按字母排序
function compareEntries(a, b) {
    const na = leadingNumber(a.name);
    const nb = leadingNumber(b.name);
    if (na !== null && nb !== null) {
        return na - nb;
    }
    if (na !== null) {
        return -1;
    }
    if (nb !== null) {
        return 1;
    }
    return a.name.localeCompare(b.name, "en", {
        sensitivity: "base"
    });
}

// 侧边栏链接通常不带 .html（cleanUrls 未开启），补成可直接访问的路径
function normalizeLink(link) {
    if (link === null || link === undefined) {
        return "";
    }
    let p = String(link).replace(/^\/+/, "").replace(/\.md$/i, "");
    if (!p) {
        return "";
    }
    if (p.endsWith("/")) {
        return `${p}index.html`;
    }
    if (!/\.html?$/i.test(p)) {
        p += ".html";
    }
    return p;
}

async function main() {
    const [repoRoot, outFile] = process.argv.slice(2);
    if (!repoRoot || !outFile) {
        process.exit(1);
    }

    let link = null;
    const originalCwd = process.cwd();
    try {
        // vitepress-sidebar 的 documentRootPath 是相对进程工作目录解析的，
        // 必须切到文档仓库目录，否则会去找 `<服务目录>/en` 而报路径不存在
        process.chdir(repoRoot);
        link = await loadFirstLinkFromConfig(repoRoot);
        if (!link) {
            console.error("VitePress 配置中没有找到侧边栏链接，改用目录扫描");
        }
    } catch (err) {
        console.error(`读取 VitePress 配置失败，改用目录扫描：${err && err.message ? err.message : err}`);
    } finally {
        try {
            process.chdir(originalCwd);
        } catch (err) {
            // 恢复工作目录失败不影响后续按绝对路径扫描
        }
    }

    if (!link) {
        link = scanFirstPage(repoRoot);
    }

    if (!link) {
        console.error("侧边栏和目录扫描都没有找到可用页面");
        process.exit(1);
    }

    fs.writeFileSync(outFile, normalizeLink(link), "utf8");
}

if (require.main === module) {
    main().catch((err) => {
        console.error(err && err.message ? err.message : err);
        process.exit(1);
    });
}

module.exports = {
    findFirstLink,
    normalizeLink,
    scanFirstPage
};
