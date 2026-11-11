# CHG0041 本地跨页免费与勾选样式

场景和听读共用use-cross-page-selection、FreeBatchControls。免费模式独立于普通本页selected，进入/退出清空两套选择；同查询稳定ID跨页累计，首次选中页记录跨页数，当前页全/半选按交集。page不入条件key，搜索/状态/分类/导入批次/sort及模块入key；先确认后切换，取消恢复受控输入、原路由和选择。

预览只读，完整滚动名单包括适用及跳过原因，0适用禁确认。确认仅发已展示pending冻结集合；未知先查原Operation，明确operation_unknown才原key原body恢复。只持久已经发送的operation跟踪及taskid，不持久未提交勾选，按API环境/管理员/模块隔离，退出或会话失效清理。处理中禁重复并冻结选择；逐项结果/进度、失败-only重preview/retry，取消重试预览仍保留原完整结果入口。真实汇总刷新保留查询、有效页及位置。

实际Chrome复现根因：共享scoped样式把ElementPlus勾号left/top改为5/2px，却保留新版居中transform，17px点击区也过小；放大可见框后半选线仍采用组件默认top5px。局部共享SCSS统一18px框、44px不缩小点击区、52px固定列；checked变换与indeterminate top/transform均显式居中，disabled/focus清晰。保留原发布/下线/删除规则。

最终完整check通过、63文件317测试通过、build通过。Chrome隔离Mock HTTP两模块各33项/四页工作流通过；8组合（1440×1025、1911×837；100/125%CSS布局缩放）checked/半选标记中心偏差0、header/row中心差0、工具栏框/文字中心差0。125%布局18px框对应屏幕CSS22.5px，44px点击区对应55px。显式unchecked/checked/indeterminate/disabled/focus截图和8份中心JSON保留在API本轮SDD workspace/screenshots，布局缩放不冒称原生浏览器125%。

另用完整0028迁移的临时SQLite/真实API/dispatcher/worker联调：两个模块各33项成功、原旧音频票据关闭后403，列表有效page4保留，双API ready200。配套小程序真实H5公开设置/政策/游客原位取消亦通过。所有服务与数据均独立fixture，不触原本地账号/库/进程。详细T396—T439映射见配套API docs/verification/chg0041-acceptance-20261111.md。

原生Chrome125%工具访问被拒绝后已停止对应CUA会话，留待人工验证；微信真机/真实友盟未验。无推送、部署、上传或生产操作。长标题无图片fixture中的“暂无场景图”占位换行沿用原样；选择列固定宽度不受标题挤压，真实fixture已同时检查实际缩略图路径。
