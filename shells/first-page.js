#!/usr/bin/env node
// 用法: node first-page.js <文档仓库路径> <输出文件>
//
// 加载文档仓库自身的 VitePress 配置（含 vitepress-sidebar 生成的侧边栏），
// 取侧边栏中的第一个链接作为“第一页”，写入输出文件。
// 这样文档结构、页面改名后无需修改任何代码。

const fs = require("fs");
const path = require("path");
const { createRequire } = require("module");
const { pathToFileURL } = require("url");

// 从仓库目录解析依赖的 ESM 入口；require.resolve 会拿到 CJS 入口，
// 而 loadConfigFromFile 只在 ESM 构建里提供
function resolveEsmEntry(repoRequire, id) {
    const pkgPath = repoRequire.resolve(`${id}/package.json`);
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

async function main() {
    const [repoRoot, outFile] = process.argv.slice(2);
    if (!repoRoot || !outFile) {
        process.exit(1);
    }

    const repoRequire = createRequire(path.join(repoRoot, "package.json"));

    let viteEntry;
    try {
        viteEntry = resolveEsmEntry(repoRequire, "vite");
    } catch (err) {
        // vite 未被提升到仓库顶层时，改从 vitepress 自身的位置解析
        const vitepressPkg = repoRequire.resolve("vitepress/package.json");
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
        process.exit(1);
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

    const siteConfig = config && config.themeConfig && config.themeConfig.sidebar;
    const link = findFirstLink(siteConfig);
    if (!link) {
        process.exit(1);
    }

    fs.writeFileSync(outFile, normalizeLink(link), "utf8");
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

if (require.main === module) {
    main().catch((err) => {
        console.error(err && err.message ? err.message : err);
        process.exit(1);
    });
}

module.exports = {
    findFirstLink,
    normalizeLink
};
