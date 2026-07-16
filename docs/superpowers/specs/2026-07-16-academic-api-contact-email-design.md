# 学术 API 联系邮箱配置设计

## 目标

在 PaperHot 的“领域配置”页面提供一个共用的学术 API 联系邮箱输入项。当前只用于 Crossref 请求，未来接入 OpenAlex 时复用同一配置，不在本次新增 OpenAlex 信源。

## 配置与页面

- 前端在外部接口配置区域显示“学术 API 联系邮箱”输入框。
- 用户直接在页面填写和保存，无需手工编辑 JSON。
- 后端将配置持久化到 `config/academic-apis.json`；仓库只提交不含个人邮箱的 `config/academic-apis.example.json`。
- 配置键使用通用名称 `academicApis.contactEmail`，避免未来为 OpenAlex 重复增加邮箱字段。
- 邮箱允许留空；非空值必须通过基本邮箱格式校验，非法值拒绝保存并返回明确错误。

## Crossref 请求

- Crossref DOI 查询和标题查询都读取 `academicApis.contactEmail`。
- 邮箱非空时，同时添加 `mailto=<邮箱>` 查询参数，并在 `User-Agent` 中携带相同邮箱。
- 邮箱为空时不发送虚假的占位邮箱，继续使用不含联系方式的 PaperHot `User-Agent`。
- 本次不增加新的重试框架、依赖或 OpenAlex 请求代码。

## 隐私与备份

- 联系邮箱是个人信息，默认本地数据导出不包含该配置。
- 只有用户显式勾选“包含 API Key 和外部接口配置”时，ZIP 才包含 `config/academic-apis.json`。
- 导入旧版 v1 ZIP 时缺少该文件仍可正常完成；导入包含该文件的 v1 ZIP 时恢复邮箱配置，因此备份版本保持 `1`。
- `BACKUP_FORMAT.md`、README 配置说明和 `CHANGELOG.md` 的“未发布”区域随实现同步更新。

## 验证

- 后端测试覆盖配置默认值、页面保存、非法邮箱拒绝和重新读取。
- Crossref 测试分别验证 DOI 与标题查询的 `mailto` 参数和 `User-Agent`，并验证空邮箱不发送占位地址。
- 导入导出测试验证默认排除、显式包含和恢复该配置。
- 前端测试验证输入项、保存负载和错误提示。
- 实现完成后运行后端、前端测试及 Node 语法检查；因涉及后端服务文件，按项目规则在固定端口 `50751` 重启并验证 HTTP 200、进程时间和断点文件读写权限。

## 成功标准

用户只需在 PaperHot 页面填写一次有效邮箱，后续 Crossref DOI 和标题请求都会携带该邮箱；未配置时不会发送虚假邮箱；默认导出不会泄露该个人信息。
