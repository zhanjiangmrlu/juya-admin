export const importStates: Record<string, string> = {
  ready: '资料完整',
  incomplete: '待补充',
  duplicate: '重复，默认跳过',
  unreadable: '无法读取',
  saving: '正在保存',
  saved: '草稿已保存',
  failed: '保存未成功'
}
export const importErrors: Record<string, string> = {
  archive_invalid: '压缩包无法读取，请重新打包；其他ZIP可以继续处理',
  zip_folder_docx_count: '每个卡片文件夹应有且仅有一份内容DOCX',
  import_media_source: '请选择当前ZIP同一卡片文件夹的素材，或单独上传补充资料',
  import_selection_invalid: '重试范围已失效，请重新核对本次卡片',
  archive_member_limit: '此文件展开后超过限制，请压缩素材或拆分资料后重新上传',
  archive_member_invalid: '此包内文件无法读取，请修正文件并重新打包',
  docx_invalid: 'DOCX无法读取，请重新保存为标准DOCX文件',
  docx_structure: '请按填写示例检查一级标题、小标题和中英文表格',
  single_docx_multiple: '这份DOCX包含多张卡片，请改用批量导入',
  zip_folder_multiple_cards: '每个文件夹只放一张卡片，请拆分或改用DOCX方式',
  archive_unsafe: '压缩包包含不安全路径或重复文件，请重新整理',
  archive_limit: '压缩包展开后超过限制，请拆分资料',
  import_card_limit: '卡片数量超过本批限制，请拆分为新的导入',
  import_empty: '未读到可恢复卡片，请检查文件夹和一级标题',
  image_invalid: '图片无法解码，请更换静态PNG、JPEG或WebP图片',
  audio_invalid: '音频无法解码，请更换可播放的完整音频',
  revision_conflict: '目标卡片已被另一窗口修改，请重新核对差异',
  card_deleted: '原目标已删除，请明确选择新增或其他目标',
  import_target_required: '同一导入资料已有草稿，请明确核对更新目标',
  worker_interrupted: '处理曾中断，可重试已接收文件',
  import_changed: '核对版本有变化，请重新核对'
}
