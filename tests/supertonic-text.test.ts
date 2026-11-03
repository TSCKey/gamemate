import { describe, expect, it } from 'vitest'
import { prepareText, splitForSpeech, textToIds } from '../src/renderer/src/voice/supertonicText'

describe('text for the Supertonic voice', () => {
  it('wraps text in its language tag and normalizes symbols', () => {
    expect(prepareText('Craft it → done', 'en')).toBe('<en>Craft it done.</en>')
    expect(prepareText('“Hi”  — friend!', 'en')).toBe('<en>"Hi" - friend!</en>')
    expect(() => prepareText('你好', 'zh')).toThrow()
  })

  it('drops characters the indexer does not know', () => {
    const indexer = Array(200).fill(-1)
    indexer[65] = 7 // 'A'
    expect(textToIds('A😀A', indexer)).toEqual([7, 7])
    expect(textToIds('Aé', indexer)).toEqual([7])
  })
})

describe('answers spoken sentence by sentence', () => {
  it('splits Latin, Japanese and Arabic sentences', () => {
    expect(splitForSpeech('Get iron. Smelt it! Done?', 'en')).toEqual([
      'Get iron.',
      'Smelt it!',
      'Done?'
    ])
    expect(splitForSpeech('鉄を取ります。かまどに入れます！', 'ja')).toEqual([
      '鉄を取ります。',
      'かまどに入れます！'
    ])
    expect(splitForSpeech('هل تريد المساعدة؟ اضغط هنا.', 'ar')).toEqual([
      'هل تريد المساعدة؟',
      'اضغط هنا.'
    ])
  })

  it('keeps Japanese and Korean pieces short and long sentences within limits', () => {
    const ja = splitForSpeech('あいう、'.repeat(60), 'ja')
    expect(ja.length).toBeGreaterThan(1)
    expect(ja.every((s) => s.length <= 120)).toBe(true)
    const en = splitForSpeech('one, two, three, four, '.repeat(30), 'en')
    expect(en.every((s) => s.length <= 300)).toBe(true)
    expect(en.join(' ').replace(/\s+/g, ' ')).toBe('one, two, three, four, '.repeat(30).trim())
  })

  it('never returns empty pieces', () => {
    expect(splitForSpeech('  ', 'en')).toEqual([])
    expect(splitForSpeech('Hi!!  ', 'en')).toEqual(['Hi!!'])
  })
})
