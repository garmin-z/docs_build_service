const {
    exec
} = require("child_process");

const {
    sendWs
} = require("../libs/ws");
const {
    generatePdf
} = require("../libs/pdf");

function index(req, rsp) {
    const script = "./build.sh";
    const deployProcess = exec(`bash ${script}`);

    deployProcess.stdout.on("data", (data) => {
        sendWs(data)
    });
    deployProcess.stderr.on("data", (data) => sendWs(`ERROR: ${data}`));

    deployProcess.on("close", (code) => {
        sendWs(`脚本执行完成，退出码：${code}`);
    });

    rsp.status(200).send({
        message: "脚本执行中，日志通过 WebSocket 发送"
    });
}


// 生成pdf
function pdf(req, rsp) {
    generatePdf("pdf", {
        outFile: 'ufactory_docs_cn.pdf',
    })

    // const opts = {
    //     outFile: 'ufactory_docs_cn.pdf',
    //     outDir: 'pdf',
    //     puppeteerLaunchOptions: {
    //         args: ['--no-sandbox']
    //     },
    //     routePatterns: ['!/server/**/**.*', '!/en/index.*', '!/**/index.*', '!/en/**'],
    //     pdfOptions: {
    //         format: 'A4',
    //         printBackground: true,
    //         displayHeaderFooter: false,
    //         headerTemplate,
    //         footerTemplate,
    //         margin: {
    //             bottom: 60,
    //             left: 25,
    //             right: 25,
    //             top: 60,
    //         },
    //     },
    //     urlOrigin: 'https://testdocs.ufactory.cc/',
    //     sorter: (pageA, pageB) => {
    //         const aIndex = routeOrder.findIndex(route => route === pageA.path)
    //         const bIndex = routeOrder.findIndex(route => route === pageB.path)
    //         return aIndex - bIndex
    //     },
    // }

}

module.exports = {
    index
}