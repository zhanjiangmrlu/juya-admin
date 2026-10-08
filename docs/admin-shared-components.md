# 后台公共组件与展示配置

本次抽离保持已还原的 Figma 外观，页面继续负责 API、业务状态、权限、校验、冲突与二次确认。配置通过代码维护并受 TypeScript 检查；修改后重新构建。业务设置仍使用原系统配置接口。

## 统一管理入口

| 入口                              | 管理内容                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------ |
| `src/app/admin-ui.config.ts`      | 卡片默认阴影/标题级别、分页容量选项、表格默认空文案与行键、卡片标题            |
| `src/app/admin-tables.config.ts`  | 用户、更正申请、权益、活动、反馈、内容、音频、批量任务、统计、版本历史的列结构 |
| `src/app/admin-records.config.ts` | 用户详情的五组关联记录、字段名与跳转目标                                       |
| `src/app/admin-presentation.ts`   | 后台顶栏标题、副标题与内容生产阶段标题                                         |
| `src/styles/tokens.scss`          | 公共颜色、间距、卡片/提示区圆角等 CSS tokens                                   |
| `src/styles/admin-surfaces.scss`  | 活动、反馈、消息页共用的卡片、表单与按钮表面                                   |

## 公共卡片 AdminPanel

所有 69 处后台页面与业务展示组件的原 ElCard 已迁入。组件默认使用无阴影卡片；保留原 ElCard 的 `body-style`、`header-class`、`body-class` 等属性，支持 `header`、`header-actions`、默认内容及 `footer` 插槽。

```vue
<AdminPanel
  :title="ADMIN_SECTION_TITLES.campaignEdit.validationCard"
  :heading="3"
  description="核对当前草稿"
  :body-style="{ padding: '16px' }"
>
  <template #header-actions>
    <ElButton :loading="loading" @click="validate">重新检查</ElButton>
  </template>
  <!-- 页面自己的业务内容 -->
</AdminPanel>
```

31 个普通卡片标题集中到 `ADMIN_SECTION_TITLES`。带状态、筛选或操作的复杂标题继续用 `header` 插槽；插槽覆盖默认标题，原结构保持可定制。标题 `heading` 支持 2/3/4，默认 3；`title-class` 保留原语义类，外观可通过 `--juya-panel-title-size`、`--juya-panel-title-line-height`、`--juya-panel-title-color` 覆盖。`admin-brand-headings` 保留原品牌文字色，`admin-operations-surface` 保留活动/反馈页的 28px 标题行高，其余为 30px。

## 公共表格 DataTable

10 组静态表格加用户详情五组动态关联记录统一使用配置列。已有默认插槽写法兼容；列定义和默认插槽同时存在时会追加列，因此单个表格一般选择其中一种。

```vue
<DataTable
  :rows="controller.users.value"
  :columns="ADMIN_TABLE_COLUMNS.users"
  row-key="user_id"
  :loading="controller.state.value === 'loading'"
  empty-text="未找到匹配用户"
>
  <template #actions="{ row }">
    <RouterLink :to="{ name: 'user-detail', params: { userId: row.user_id } }">
      查看
    </RouterLink>
  </template>
</DataTable>
```

每列由 `TableColumnConfig` 校验：`key` 为稳定列键；`prop` 指定原始字段；`label`、`width`、`minWidth`、`fixed`、`align`、`sortable`、`showOverflowTooltip` 控制展示。`type` 支持普通、展开、选择和序号列；`hidden: true` 可隐藏列；`slot` 指向页面命名插槽。修改数组顺序可统一调整列顺序。

表格使用原 Element Plus 交互：`stripe`、`aria-label`、排序/选择等属性与监听传入内部表格。业务插槽收到类型推断的 `row`、`$index`，运行时保留原表格完整 scope。列注册时的空行探测不会调用业务单元格。缺少命名插槽时显示该列 `prop` 的原值，不伪造缺失值。

固定列宽和操作插槽集中配置，但权限判断、确认对话框和动作回调留在页面。展示层隐藏列不能代替服务器权限控制。

## 操作说明 AdminNotice

活动、反馈六个页面共用同一提示区，标题通过 prop 配置，内容通过默认插槽提供。背景、圆角、字号、标题色与段落间距集中在组件和 tokens。

```vue
<AdminNotice title="提交前确认">
  <p>保存前核对当前服务端版本。</p>
</AdminNotice>
```

## 分页 AppPagination

全站默认容量选项为 `ADMIN_UI_DEFAULTS.pagination.pageSizes`，初始容量为 `pagination.pageSize`，六处分页页面/组件均使用该值初始化；内容目录恢复已保存筛选时也按公共选项检查。特殊页面通过 `:page-sizes="[15, 30]"` 覆盖。原已知总数/未知总数、上一页/下一页、直接跳页和 `change(page, size)` 保持不变；调整容量仍回第一页并只发一次查询。

## 验收

- `pnpm check`：格式、ESLint、Stylelint、Vue/TypeScript 检查通过。
- `pnpm test --maxWorkers=2`：89 个文件、300 项通过；最终分页配置接入后针对性复验 23 项通过。并行运行检查和浏览器时曾出现全路由动态导入用例的 5 秒超时，减少单测并发后完整通过，没有放宽测试超时。
- `pnpm test:e2e --workers=2`：原完整浏览器集 121/121 通过。新增公共组件外观回归 2/2 通过；最终公共组件与分页联合复验 4/4、A26 双视口截图复验 2/2 通过。
- `pnpm build`：通过，2420 个模块；没有部署。
- 全部 26 页、52 张双视口截图与抽离前比较：44 张逐像素一致，其余 8 张最多 0.02109% 像素变化，范围为更新时间、边角/滚动条微小渲染差异。数值记录 `.impeccable/review/shared-components-comparison.json`，基线 `.impeccable/review/shared-components-before/`。
- 独立审查发现的表格 scope/颜色覆盖和标题行高问题已关闭。公共表格跳过列注册空行探测；恢复父页 scopeId；操作页禁用表单维持原 CSS 特异性。系统配置标题合并样式问题先复现 13px，修复后 20px/30px 与双视口截图通过。
- `rg '<ElCard|<ElTable\\b|<ElTableColumn\\b' src/pages src/features` 无匹配；原卡片与表格实例已迁出页面。

浏览器业务回归使用已有模拟 API，与上一轮 Figma 验收边界一致；此次没有改 API/业务 composable，也没有执行真实 OCR、发布、配置写入或生产部署。
