<script setup lang="ts">
import { ElMessageBox } from 'element-plus'
import { ref } from 'vue'

import type { components } from '@/shared/contracts/generated/admin-api'

import { parseDialogue, type SceneContent } from './editor-model'
import SceneMediaField from './scene-media-field.vue'
import SceneWordSource from './scene-word-source.vue'
const content = defineModel<SceneContent>({ required: true })
defineProps<{ limits: components['schemas']['UploadConfiguration'] | null; disabled?: boolean }>()
const emit = defineEmits<{ uploading: [value: boolean] }>()
const pasted = ref(''),
  pasteOpen = ref(false),
  pasteError = ref(''),
  pasteCandidate = ref<SceneContent['dialogue'] | null>(null)
let uploads = 0
/** 汇总各素材字段的处理状态
 * @param busy 单个字段的上传状态
 */
const uploading = (busy: boolean) => {
  uploads += busy ? 1 : -1
  emit('uploading', uploads > 0)
}
/** 调整资料条目的展示顺序
 * @param items 当前条目集合
 * @param index 当前条目索引
 * @param delta 移动方向
 */
const move = (items: unknown[], index: number, delta: number) => {
  const target = index + delta
  if (target < 0 || target >= items.length) return
  ;[items[index], items[target]] = [items[target], items[index]]
}
/** 删除对话前说明被引用词汇的影响
 * @param index 待删除对话索引
 */
const removeLine = async (index: number) => {
  const id = content.value.dialogue[index]?.id
  if (content.value.vocabulary.some((word) => word.source?.line_id === id)) {
    try {
      await ElMessageBox.confirm(
        '该原句关联的词汇将需要重新核对高亮位置，是否删除？',
        '删除这组对话？',
        { confirmButtonText: '确认删除', cancelButtonText: '继续编辑' }
      )
    } catch {
      return
    }
  }
  content.value.dialogue.splice(index, 1)
}
/** 新增一组完整对话输入框
 * @returns 当前对话数量
 */
const addLine = () =>
  content.value.dialogue.push({ id: crypto.randomUUID(), speaker: '', english: '', chinese: '' })
/** 新增本句词汇输入框
 * @returns 当前词汇数量
 */
const addWord = () =>
  content.value.vocabulary.push({
    id: crypto.randomUUID(),
    english: '',
    meaning: '',
    phonetic: '',
    source: null,
    pronunciation_text: '',
    pronunciation_issue: false
  })
/** 新增选填语块输入框
 * @returns 当前语块数量
 */
const addChunk = () =>
  content.value.chunks.push({ id: crypto.randomUUID(), english: '', chinese: '' })
/** 固定格式解析只产生候选，不覆盖现有输入 */
const parse = () => {
  pasteError.value = ''
  try {
    pasteCandidate.value = parseDialogue(pasted.value)
  } catch (reason) {
    pasteCandidate.value = null
    pasteError.value = reason instanceof Error ? reason.message : '请确认对应关系'
  }
}
/** 确认候选后替换对话，原词汇来源重新核对 */
const applyPaste = () => {
  if (pasteCandidate.value) {
    content.value.dialogue = pasteCandidate.value
    content.value.vocabulary.forEach((word) => {
      word.source = null
    })
    pasteOpen.value = false
  }
}
</script>
<template>
  <fieldset :disabled="disabled" class="content-fields">
    <section id="field-basic" class="panel">
      <h2>1. 基本资料</h2>
      <label class="field"
        >卡片名称<input v-model="content.name" maxlength="160" placeholder="例如：在咖啡店点单"
      /></label>
      <p v-if="!limits" class="notice error">暂未获取上传限制，请重试加载页面</p>
      <div class="media-grid">
        <SceneMediaField
          v-model="content.image_id"
          kind="image"
          :limit="limits?.image_limit_bytes || 0"
          @busy="uploading"
        /><SceneMediaField
          v-model="content.audio_id"
          kind="audio"
          :limit="limits?.audio_limit_bytes || 0"
          @busy="uploading"
        />
      </div>
    </section>
    <section id="field-dialogue" class="panel">
      <div class="between">
        <h2>2. 场景对话</h2>
        <button
          type="button"
          @click="
            () => {
              pasteOpen = true
              pasteCandidate = null
            }
          "
        >
          粘贴／编辑对话
        </button>
      </div>
      <p class="section-help">每组填写人物、英文和中文，不需要设置音频时间</p>
      <div v-for="(line, index) in content.dialogue" :key="line.id" class="entry">
        <div class="between">
          <strong>第 {{ index + 1 }} 组</strong>
          <div class="row">
            <button
              type="button"
              class="small"
              :disabled="index === 0"
              aria-label="对话上移"
              @click="move(content.dialogue, index, -1)"
            >
              ↑</button
            ><button
              type="button"
              class="small"
              :disabled="index === content.dialogue.length - 1"
              aria-label="对话下移"
              @click="move(content.dialogue, index, 1)"
            >
              ↓</button
            ><button type="button" class="text danger small" @click="removeLine(index)">
              删除
            </button>
          </div>
        </div>
        <label class="field"
          >人物<input v-model="line.speaker" maxlength="80" placeholder="例如：顾客"
        /></label>
        <div class="two-columns">
          <label class="field"
            >英文台词<textarea
              v-model="line.english"
              maxlength="20000"
              placeholder="英文原句"
            /></label
          ><label class="field"
            >中文台词<textarea v-model="line.chinese" maxlength="20000" placeholder="本句中文" />
          </label>
        </div>
      </div>
      <button type="button" :disabled="content.dialogue.length >= 200" @click="addLine">
        ＋ 添加一组对话
      </button>
    </section>
    <section id="field-vocabulary" class="panel">
      <h2>3. 重点词汇</h2>
      <p class="section-help">填写本句释义，并确认对应原句中的具体片段</p>
      <div v-for="(word, index) in content.vocabulary" :key="word.id" class="entry">
        <div class="between">
          <strong>词汇 {{ index + 1 }}</strong>
          <div class="row">
            <button
              type="button"
              class="small"
              :disabled="index === 0"
              aria-label="词汇上移"
              @click="move(content.vocabulary, index, -1)"
            >
              ↑</button
            ><button
              type="button"
              class="small"
              :disabled="index === content.vocabulary.length - 1"
              aria-label="词汇下移"
              @click="move(content.vocabulary, index, 1)"
            >
              ↓</button
            ><button
              type="button"
              class="text danger small"
              @click="content.vocabulary.splice(index, 1)"
            >
              删除
            </button>
          </div>
        </div>
        <div class="two-columns">
          <label class="field"
            >英文词汇<input
              v-model="word.english"
              maxlength="300"
              @input="word.source = null" /></label
          ><label class="field"
            >本句中文释义<input v-model="word.meaning" maxlength="2000"
          /></label>
        </div>
        <label class="field"
          >音标（选填）<input
            v-model="word.phonetic"
            maxlength="300"
            placeholder="仅用于展示" /></label
        ><SceneWordSource
          :dialogue="content.dialogue"
          :word="word"
          @select="word.source = $event"
        /><label class="check-field"
          ><input
            v-model="word.pronunciation_issue"
            type="checkbox"
          />读音待核对（勾选后保留草稿，暂不发布）</label
        >
      </div>
      <button type="button" :disabled="content.vocabulary.length >= 100" @click="addWord">
        ＋ 添加词汇
      </button>
    </section>
    <section id="field-chunks" class="panel">
      <div class="between">
        <h2>4. 语块 <small class="muted">（选填）</small></h2>
        <button type="button" :disabled="content.chunks.length >= 100" @click="addChunk">
          ＋ 添加语块
        </button>
      </div>
      <p v-if="!content.chunks.length" class="section-help">没有可直接跳过</p>
      <div v-for="(chunk, index) in content.chunks" :key="chunk.id" class="entry">
        <div class="between">
          <strong>语块 {{ index + 1 }}</strong>
          <div class="row">
            <button
              type="button"
              class="small"
              :disabled="index === 0"
              @click="move(content.chunks, index, -1)"
            >
              ↑</button
            ><button
              type="button"
              class="small"
              :disabled="index === content.chunks.length - 1"
              @click="move(content.chunks, index, 1)"
            >
              ↓</button
            ><button
              type="button"
              class="text danger small"
              @click="content.chunks.splice(index, 1)"
            >
              删除
            </button>
          </div>
        </div>
        <div class="two-columns">
          <label class="field">英文<input v-model="chunk.english" maxlength="2000" /></label
          ><label class="field">中文释义<input v-model="chunk.chinese" maxlength="2000" /></label>
        </div>
      </div>
    </section>
  </fieldset>
  <ElDialog
    v-model="pasteOpen"
    title="粘贴／编辑对话"
    width="700px"
    append-to-body
    :close-on-click-modal="false"
    ><p class="muted">每行一组：人物 | 英文台词 | 中文台词</p>
    <label class="field"
      >对话文本<textarea
        v-model="pasted"
        rows="7"
        placeholder="顾客 | May I have a coffee? | 我想要一杯咖啡。"
        @input="pasteCandidate = null"
      />
    </label>
    <p v-if="pasteError" class="notice error" role="alert">{{ pasteError }}</p>
    <div v-if="pasteCandidate" class="notice">
      <strong
        >将用以下 {{ pasteCandidate.length }} 组替换当前
        {{ content.dialogue.length }} 组对话</strong
      >
      <p v-for="row in pasteCandidate" :key="row.id">
        {{ row.speaker }}：{{ row.english }} / {{ row.chinese }}
      </p>
      <p>原词汇来源需要重新核对，其他未保存输入会保留。</p>
    </div>
    <template #footer
      ><button type="button" @click="pasteOpen = false">取消</button>
      <button v-if="!pasteCandidate" type="button" class="primary" @click="parse">
        生成可编辑预览</button
      ><button v-else type="button" class="primary" @click="applyPaste">
        确认替换对话
      </button></template
    ></ElDialog
  >
</template>
<style scoped lang="scss">
.content-fields {
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
}

.media-grid,
.two-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.section-help {
  font-size: 12px;
  color: var(--muted);
  margin: 10px 0 20px;
}

.entry {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 18px;
  margin: 18px 0;
  background: #fffefb;

  .field {
    margin: 12px 0;
  }
}

.check-field {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--muted);
  margin-top: 12px;
}

.two-columns .field {
  margin-top: 8px;
}

@media (width <= 1100px) {
  .two-columns {
    grid-template-columns: 1fr;
    gap: 0;
  }
}
</style>
