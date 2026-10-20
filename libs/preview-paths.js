// 各文档类型预览时的“第一页”路径（相对于预览站点根路径，预览端口 3040）
// 路径与各文档分支 en/ 目录结构一致：取各文档侧边栏的第一个页面（Preface/前言等）
const FIRST_PAGE_PATHS = {
    xarm: "0.preface.html",
    lite6: "0.preface.html",
    "850": "0.preface.html",
    usermanual: "user_manual/ufactoryStudio/1.preface.html",
    accessories: "6_Axis_Force_Torque_Sensor/1.Introduction.html",
    api: "gcode/ufactory_Gcode.html",
    support_article: "support_articles/developer/collision-detection-in-ufactory-robotic-arms-current-and-dynamic-model-based-feature.html",
    releasenote: "release_note/version_list.html"
};

// 返回相对于预览站点根路径的第一页路径；未知类型返回空字符串
function getFirstPagePath(docs) {
    return FIRST_PAGE_PATHS[docs] || "";
}

module.exports = {
    getFirstPagePath
};
