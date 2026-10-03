import { expect, test } from 'claude-code/testing'

const DONE = {
  exitCode: 0,
  stdout: '',
  stderr: '',
  isStdoutTruncated: false,
  isStderrTruncated: false,
}
const edit = (text: string, start: number, end: number, inputText: string) =>
  ({ origin: { kind: 'composer' }, text, cursor: end, start, end, inputText }) as const

test('la password scritta nel prompt è mascherata e arriva a sudo', async ($, on) => {
  let saved: string | undefined
  let ran = ''
  let release: (exitCode: number) => void = () => {}
  let waiterStarted: () => void = () => {}
  const started = new Promise<void>(resolve => {
    waiterStarted = resolve
  })

  on('process.run', (_, e) => {
    const script = e.argv[2] ?? ''

    if (script.includes('until')) {
      waiterStarted()

      return new Promise(resolve => {
        release = exitCode => resolve({ value: { ...DONE, exitCode } })
      })
    }
    if (script.includes('cat >')) {
      saved = e.init?.stdin
      release(0)
    }

    return { value: DONE }
  })
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }))
  on('prompt.fill', () => ({ isFilled: true }))
  on('prompt.edit', (_, e) => {
    const text = e.text.slice(0, e.start) + e.inputText + e.text.slice(e.end)

    return { text, cursor: e.start + e.inputText.length }
  })
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('tool.call', { tool: 'Bash' }, (_, e) => {
    ran = e.command

    return { result: {} } as never
  })

  // Il kit alza `prompt.edit` ma non lo dichiara ancora nei tipi di `$`.
  const type = (e: ReturnType<typeof edit>) =>
    ($.prompt as unknown as { edit: (e: unknown) => Promise<{ text: string }> }).edit(e)

  const call = $.tool.call({ tool: 'Bash', command: 'sudo pacman -Syu && sudo -A true' })
  await started

  const ui = await $.ui.mount({
    plugin: 'sudo-popup',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: {} as never,
  })
  expect(await ui.find({ type: 'Text', text: /pacman -Syu/ })).toBeDefined()

  expect((await type(edit('', 0, 0, 's3x'))).text).toBe('•••')
  expect((await type(edit('•••', 2, 3, ''))).text).toBe('••')
  expect((await type(edit('••', 0, 0, 'A'))).text).toBe('•••')
  expect(saved).toBeUndefined()

  const sent = await $.prompt.submit({ text: '•••' } as never)
  expect(sent.drop).toBeDefined()
  await call
  expect(saved).toBe('As3\n')
  expect(ran).toBe('sudo -A pacman -Syu && sudo -A true')

  expect((await type(edit('', 0, 0, 'ciao'))).text).toBe('ciao')
})

test('un comando senza sudo passa senza popup', async ($, on) => {
  let scripts = 0
  on('process.run', () => {
    scripts += 1

    return { value: DONE }
  })
  on('tool.call', { tool: 'Bash' }, () => ({ result: {} }) as never)

  await $.tool.call({ tool: 'Bash', command: 'echo pseudo sudoku' })
  expect(scripts).toBe(0)
})
