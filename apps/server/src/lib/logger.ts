import { execSync } from 'node:child_process'
import pino from 'pino'
import { getConfig } from '../core/config/index.js'

let _logger: pino.Logger | null = null

// Windows 终端默认代码页不支持 UTF-8，Pino/sonic-boom 通过 fs.write 直接写 fd 会导致乱码
function fixWindowsCodePage() {
  if (process.platform === 'win32') {
    try {
      execSync('chcp 65001', { stdio: 'pipe' })
    } catch {
      // chcp 不可用时忽略
    }
  }
}

export function getLogger(): pino.Logger {
  if (_logger) return _logger

  fixWindowsCodePage()

  const config = getConfig()

  _logger = pino({
    level: config.LOG_LEVEL,
    transport: config.NODE_ENV === 'development' ? { target: 'pino-pretty', options: { colorize: true } } : undefined,
  })

  return _logger
}
