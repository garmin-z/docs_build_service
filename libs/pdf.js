const {
    join
} = require('node:path');
const process = require('node:process');
const {
    createRequire
} = require('node:module');
const {
    createServer,
    resolveConfig
} = require('vitepress');
const debug = require('debug');
const hash = require('hash-sum');
const {
    checkEnv,
    resolveUserConfigPath,
    resolveUserConfigConventionalPath,
    loadModule,
    timeTransformer,
    generatePdf
} = require('@condorhero/vuepress-plugin-export-pdf-core');

const engines = {
    node: ">=18"
};

const peerDependencies = {
    vitepress: ">=1.0.0-alpha.35"
};

const devDebug = debug("vitepress-export-pdf:dev-server");
const PORT = 16762;
const HOST = "localhost";



const CMD_OPTIONS = {
    outDir: 'pdf',
    puppeteerLaunchOptions: {
        args: ['--no-sandbox']
    },
    routePatterns: ['!/server/**/**.*', '!/en/index.*', '!/**/index.*', '!/en/**'],
    pdfOptions: {
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: false,
        headerTemplate,
        footerTemplate,
        margin: {
            bottom: 60,
            left: 25,
            right: 25,
            top: 60,
        },
    },
    urlOrigin: 'https://testdocs.ufactory.cc/',
    sorter: (pageA, pageB) => {
        const aIndex = routeOrder.findIndex(route => route === pageA.path)
        const bIndex = routeOrder.findIndex(route => route === pageB.path)
        return aIndex - bIndex
    },
}

const moduleRequire = createRequire(
    import.meta.url);
const {
    version
} = moduleRequire("vitepress/package.json");
async function generate(dir = "docs", opts = {}) {
    const commandOptions = {
        ...CMD_OPTIONS,
        ...opts
    }
    checkEnv("VitePress", engines.node, version, peerDependencies.vitepress);
    const sourceDir = join(process.cwd(), dir);
    if (commandOptions.debug)
        debug.enabled("vitepress-export-pdf:*");
    devDebug("sourceDir: %s", sourceDir);
    let userConfig = {};
    const userConfigPath = commandOptions.config ? resolveUserConfigPath(commandOptions.config) : resolveUserConfigConventionalPath(sourceDir, "vitepress");
    if (userConfigPath)
        userConfig = await loadModule(userConfigPath);
    if (Array.isArray(userConfig.routePatterns))
        userConfig.routePatterns = ["/**", "!/404.html", ...userConfig.routePatterns];
    else
        userConfig.routePatterns = ["/**", "!/404.html"];
    const vitepressOutFile = commandOptions.outFile ?? `vitepress-${timeTransformer()}.pdf`;
    const vitepressOutDir = commandOptions.outDir ?? ".";
    devDebug("userConfig: %O", userConfig);
    const {
        sorter,
        puppeteerLaunchOptions,
        pdfOptions,
        routePatterns,
        outFile = vitepressOutFile,
        outDir = vitepressOutDir,
        urlOrigin = commandOptions.urlOrigin,
        pdfOutlines = commandOptions.pdfOutlines,
        outlineContainerSelector = ".VPContent"
    } = userConfig;
    const devServer = await createServer(sourceDir, {
        port: PORT,
        host: HOST
    });
    const {
        port = PORT, host = HOST
    } = devServer.config.server;
    const devApp = await devServer.listen(port);
    devApp.printUrls();
    process.stdout.write("\n");
    process.stdout.write("Start to generate current site to PDF ...");
    const {
        pages,
        tempDir,
        cleanUrls
    } = await resolveConfig(devApp.config.root);
    const haveCleanUrls = cleanUrls ? "" : ".html";
    const hashPages = pages.map((page) => ({
        path: `${devServer.config.base}${page.replace(/\.md$/, haveCleanUrls)}`,
        key: `v-${hash(page)}`
    }));
    try {

        await generatePdf({
            pages: hashPages,
            tempDir,
            host: typeof host === "boolean" ? HOST : host,
            port,
            outFile,
            outDir,
            sorter,
            urlOrigin,
            pdfOptions,
            pdfOutlines,
            routePatterns,
            puppeteerLaunchOptions,
            outlineContainerSelector
        });
    } catch (error) {
        console.error(error);
    }
    await devApp.close();
    process.exit(0);
}

module.exports = {
    generatePdf: generate
}