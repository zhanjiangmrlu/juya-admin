---
name: 句芽英语管理后台
description: 深绿台账式的单管理员内容与运营工作台
colors:
  primary: '#2f7d61'
  primary-hover: '#286c54'
  primary-soft: '#eaf3ef'
  sidebar: '#183d31'
  sidebar-hover: '#245344'
  brand-accent: '#75ad98'
  success: '#2f8a62'
  success-soft: '#d8eee3'
  warning: '#d98e2f'
  warning-soft: '#fbebcf'
  danger: '#c94d48'
  info: '#64748b'
  text-primary: '#1f2d27'
  text-regular: '#52615b'
  text-secondary: '#66736e'
  border: '#dfe5e1'
  border-light: '#e9edea'
  page: '#f4f3ee'
  surface: '#ffffff'
typography:
  display:
    fontFamily: 'Inter, PingFang SC, Microsoft YaHei, sans-serif'
    fontSize: 'clamp(34px, 4vw, 52px)'
    fontWeight: 600
    lineHeight: 1.28
  form-title:
    fontFamily: 'Inter, PingFang SC, Microsoft YaHei, sans-serif'
    fontSize: '30px'
    fontWeight: 600
    lineHeight: 1.3
  headline:
    fontFamily: 'Inter, PingFang SC, Microsoft YaHei, sans-serif'
    fontSize: '20px'
    fontWeight: 600
    lineHeight: 1.4
  title:
    fontFamily: 'Inter, PingFang SC, Microsoft YaHei, sans-serif'
    fontSize: '16px'
    fontWeight: 600
    lineHeight: 1.5
  page-title:
    fontFamily: 'Inter, PingFang SC, Microsoft YaHei, sans-serif'
    fontSize: '18px'
    fontWeight: 600
    lineHeight: 1.5
  section-title:
    fontFamily: 'Inter, PingFang SC, Microsoft YaHei, sans-serif'
    fontSize: '15px'
    fontWeight: 600
    lineHeight: 1.5
  body:
    fontFamily: 'Inter, PingFang SC, Microsoft YaHei, sans-serif'
    fontSize: '14px'
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: 'Inter, PingFang SC, Microsoft YaHei, sans-serif'
    fontSize: '12px'
    fontWeight: 600
    lineHeight: 1.5
  compact:
    fontFamily: 'Inter, PingFang SC, Microsoft YaHei, sans-serif'
    fontSize: '13px'
    fontWeight: 600
    lineHeight: 1.5
  micro:
    fontFamily: 'Inter, PingFang SC, Microsoft YaHei, sans-serif'
    fontSize: '11px'
    fontWeight: 400
    lineHeight: 1.5
  feature:
    fontFamily: 'Inter, PingFang SC, Microsoft YaHei, sans-serif'
    fontSize: '17px'
    fontWeight: 600
    lineHeight: 1.4
  metric:
    fontFamily: 'Inter, PingFang SC, Microsoft YaHei, sans-serif'
    fontSize: '26px'
    fontWeight: 600
    lineHeight: 1
  counter:
    fontFamily: 'Inter, PingFang SC, Microsoft YaHei, sans-serif'
    fontSize: '28px'
    fontWeight: 600
    lineHeight: 1
  icon:
    fontFamily: 'Inter, PingFang SC, Microsoft YaHei, sans-serif'
    fontSize: '24px'
    fontWeight: 400
    lineHeight: 1
  brand-icon:
    fontFamily: 'Inter, PingFang SC, Microsoft YaHei, sans-serif'
    fontSize: '25px'
    fontWeight: 400
    lineHeight: 1
rounded:
  control: '6px'
  panel: '8px'
  brand: '12px'
  login-brand: '14px'
  feature: '18px'
  pill: '999px'
spacing:
  xs: '4px'
  sm: '8px'
  md: '12px'
  lg: '16px'
  xl: '20px'
  xxl: '24px'
  section: '32px'
components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.surface}'
    typography: '{typography.body}'
    rounded: '{rounded.control}'
    padding: '8px 15px'
    height: '32px'
  button-primary-hover:
    backgroundColor: '{colors.primary-hover}'
    textColor: '{colors.surface}'
    rounded: '{rounded.control}'
  card:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.text-primary}'
    rounded: '{rounded.panel}'
    padding: '20px'
  input:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.text-primary}'
    rounded: '{rounded.control}'
    padding: '6px 12px'
    height: '32px'
  status-pill:
    backgroundColor: '{colors.primary-soft}'
    textColor: '{colors.primary-hover}'
    typography: '{typography.label}'
    rounded: '{rounded.pill}'
    padding: '4px 10px'
---

# Design System: 句芽英语管理后台

## Overview

**Creative North Star: "清晰的运营台账"**

系统像一份可信、紧凑且持续更新的运营台账：深绿色侧栏提供稳定坐标，中性操作底承载白色数据面板，管理员首先看到状态、对象和下一步操作。视觉层级服务于扫描效率与审计信心，不把后台做成营销页面，也不以装饰抢占业务信息的注意力。

组件克制而明确。绿色表达当前入口和主要行动，橙、红、蓝灰只用于语义状态；边框、浅底与极轻阴影负责划分区域。所有状态都同时提供文字或图标，使高风险操作和异常信息在弱色觉环境下仍然可理解。

**Key Characteristics:**

- 深绿固定侧栏与浅暖灰操作底
- 白色紧凑面板、细边框和极轻环境阴影
- 以对象编号、状态、时间和操作为中心的信息层级
- Element Plus 基础控件与项目语义令牌统一
- 1440×900 主工作区并兼容 1280×800

## Colors

配色以深植物绿建立可信与稳定感，以浅暖中性色保持长时间操作的舒适度，语义色只在状态和风险需要时出现。

### Primary

- **句芽行动绿**（#2f7d61）：主按钮、当前导航、开关和关键可操作状态
- **深行动绿**（#286c54）：悬停、强调文字和高对比绿色状态
- **薄荷提示底**（#eaf3ef）：管理员徽标、轻状态和选中区域的柔和底色

### Secondary

- **台账深林绿**（#183d31）：固定侧栏、品牌文字与需要稳定锚点的深色标题
- **侧栏悬停绿**（#245344）：深色导航上的悬停反馈
- **品牌柔绿**（#75ad98）：登录页英文标识与深色背景上的次级品牌强调

### Tertiary

- **成功绿**（#2f8a62）：完成、正常和通过状态
- **成功浅底**（#d8eee3）：头像、成功摘要与正向状态的低强调表面
- **提醒橙**（#d98e2f）：到期、容量、待确认和警告
- **提醒浅底**（#fbebcf）：容量和待处理信息的浅色提示表面
- **风险红**（#c94d48）：失败、撤销和不可逆风险
- **信息蓝灰**（#64748b）：普通信息与中性状态

### Neutral

- **墨绿正文**（#1f2d27）：标题与主要正文
- **灰绿正文**（#52615b）：普通说明与表格内容
- **次级灰绿**（#66736e）：辅助说明、时间和占位信息
- **结构边框**（#dfe5e1）与**轻分隔线**（#e9edea）：面板、表格和分区边界
- **暖灰工作底**（#f4f3ee）：应用内容区背景
- **纯白面板**（#ffffff）：卡片、表单和顶栏表面

**The Green Rarity Rule.** 行动绿只标记当前入口、主操作和正向状态，不能铺满内容面板

**The Semantic Pairing Rule.** 危险、警告和成功状态必须同时有文字或图标，不能只依赖颜色

## Typography

**Display Font:** Inter、PingFang SC、Microsoft YaHei 与系统无衬线回退
**Body Font:** Inter、PingFang SC、Microsoft YaHei 与系统无衬线回退

**Character:** 字体体系以清晰、稳定、低干扰为目标。英文编号与中文业务术语共享无衬线骨架，避免装饰字体削弱密集信息的扫描速度。

### Hierarchy

- **Display**（600，34–52px，1.28）：登录品牌主标题
- **Form Title**（600，30px，1.3）：登录表单标题
- **Headline**（600，20px，1.4）：顶栏当前模块名称
- **Page Title**（600，18px，1.5）：业务页面主标题
- **Title**（600，16px，1.5）：主要卡片标题
- **Section Title**（600，15px，1.5）：紧凑卡片与表单分区标题
- **Body**（400，14px，1.5）：表单、表格和主要说明
- **Compact**（600，13px，1.5）：表格强调值与对象编号
- **Label**（600，12px，1.5）：状态、分组和时间
- **Micro**（400，11px，1.5）：页面编号与低优先级元数据

**The Scan First Rule.** 页面标题短而稳定，对象编号、状态和时间不得使用装饰性字形或过低对比度

## Layout

桌面框架使用 222px 固定侧栏和 66px 顶栏，主内容区内边距为上 22px、水平 24px、下 32px。页面以 12–16px 的紧凑间距组织过滤器和卡片，以 24–32px 区分较大章节。多栏业务区优先使用 `minmax(0, …)` 网格，避免长对象编号撑破页面。

1440×900 是主要工作视口，1280×800 是最低桌面验收视口。约 1000–1100px 时，多栏表单与详情切换为单列；900px 以下登录页隐藏品牌侧并保留完整认证表单。表格可以在自身容器内横向滚动，但页面根节点不得横向滚动。

## Elevation & Depth

系统以色块和细边框形成结构，阴影只提供非常轻的环境分层。面板保持近乎平面，弹窗依赖遮罩与边界而不是夸张浮起；交互状态通过颜色、描边和内容变化表达。

### Shadow Vocabulary

- **面板环境阴影**（`0 1px 3px rgb(31 45 39 / 6%)`）：白色卡片在暖灰工作底上的最低限度分层

**The Flat Ledger Rule.** 常驻信息表面保持平坦，禁止使用厚重投影、玻璃模糊或高光渐变制造层级

## Shapes

控件使用轻微弧角（6px），面板使用克制圆角（8px），品牌标记使用 12px 圆角。状态标签、头像和小型计数使用圆形或胶囊轮廓。边框保持 1px、低对比；危险操作仍沿用同一几何体系，通过语义色和确认结构表达风险。

## Components

### Buttons

- **Shape:** 紧凑弧角（6px），默认高度 32px
- **Primary:** 行动绿底与白色文字，单页只保留一个清晰主动作
- **Hover / Focus:** 悬停转为深行动绿，键盘焦点必须保留 Element Plus 的可见焦点反馈
- **Secondary / Ghost:** 白底或透明底，用于返回、查看和非主流程操作

### Chips

- **Style:** 胶囊轮廓，浅语义底与深语义文字，并配 12px 图标
- **State:** 成功、警告、危险、信息四种语义；标签文案必须独立表达状态

### Cards / Containers

- **Corner Style:** 面板圆角（8px）
- **Background:** 纯白面板置于暖灰工作底
- **Shadow Strategy:** 仅使用面板环境阴影
- **Border:** 轻分隔线形成清晰但不刺眼的结构
- **Internal Padding:** 以 16–24px 为主要密度区间

### Inputs / Fields

- **Style:** 白底、细边框、6px 圆角和紧凑高度
- **Focus:** 使用行动绿描边与控件库焦点反馈
- **Error / Disabled:** 错误使用文字和红色共同说明；禁用态仍保持标签可读并解释原因

### Navigation

固定深林绿侧栏承载模块坐标，使用 Element Plus 多级菜单展示模块与 A01–A26 页面。一级菜单项高 44px，二级页面项高 36px；活动项使用白色表面与行动绿文字，缺少业务对象上下文的流程页显示为禁用态并解释进入方式。基础能力通过 11px 分组标签与一级业务模块分隔。侧栏内容可独立纵向滚动，折叠即时完成且保留弹出式子菜单；纯图标按钮必须提供可访问名称。

### High-risk Confirmation

高风险确认弹窗先展示对象编号、状态变化和影响范围，再收集审计原因。提交按钮在原因无效时禁用，命令状态不能仅靠弹窗关闭表示成功。

## Do's and Don'ts

### Do:

- **Do** 使用项目令牌和 Element Plus 主题变量保持所有页面一致
- **Do** 用页面根语义类组织 scoped SCSS 嵌套，类名保持简洁且表达内容角色
- **Do** 在 1440×900 与 1280×800 同时验证页面布局和长文本
- **Do** 让状态、对象编号、时间、原因和下一步操作在首屏可扫描
- **Do** 为图标按钮、输入和开关提供清晰的可访问名称或邻近标签

### Don't:

- **Don't** 使用 BEM 类名、深层全局选择器或散落的未命名颜色替代语义令牌
- **Don't** 把后台页面设计成营销落地页，不添加大面积英雄区、装饰插画或无业务含义的渐变
- **Don't** 用过量绿色填充面板，也不要让危险操作只靠红色区分
- **Don't** 让表格、长编号或冲突详情造成页面级横向滚动
- **Don't** 为待接入接口伪造成功态、统计图或生产数据
