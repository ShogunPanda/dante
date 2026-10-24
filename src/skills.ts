import { readFileSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface SkillsOptions {
  /** Registered skill ID to print when no name is supplied. Defaults to dante. */
  default?: string
  files?: Record<string, string>
}

export function validateSkills(options: SkillsOptions): void {
  const validatePath = (path: string): void => {
    if (typeof path !== 'string' || !isAbsolute(path)) {
      throw new Error('Skill files must have absolute paths')
    }
  }

  for (const [name, path] of Object.entries(options.files ?? {})) {
    if (name === 'dante' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(name)) {
      throw new Error(`Invalid skill name "${name}": use letters, numbers, hyphens or underscores; "dante" is reserved`)
    }
    validatePath(path)
  }

  if (
    options.default !== undefined &&
    (typeof options.default !== 'string' ||
      (options.default !== 'dante' && !Object.hasOwn(options.files ?? {}, options.default)))
  ) {
    throw new Error(`Unknown default skill "${options.default}": select "dante" or an ID registered in skills.files`)
  }
}

export function printSkill(name: string | undefined, flags: { list?: boolean }): void {
  try {
    const options: SkillsOptions = JSON.parse(process.env.DANTE_INTERNAL_SKILLS ?? '{}')
    validateSkills(options)
    const dante = fileURLToPath(new URL('../SKILL.md', import.meta.url))
    const files = new Map([['dante', dante], ...Object.entries(options.files ?? {})])

    if (flags.list) {
      if (name !== undefined) {
        throw new Error('Use either a skill name or --list')
      }
      process.stdout.write([...files.keys()].join('\n') + '\n')
      return
    }

    const selected = name ?? options.default ?? 'dante'
    const path = files.get(selected)
    if (path === undefined) {
      throw new Error(`Unknown skill "${selected}". Available skills: ${[...files.keys()].join(', ')}`)
    }
    process.stdout.write(readFileSync(path))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
