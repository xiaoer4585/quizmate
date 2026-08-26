const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createRequire } = require('node:module')
const { extractAll } = require('@electron/asar')

async function verify(appOutDir) {
  const resourcesDir = path.join(appOutDir, 'resources')
  const asarPath = path.join(resourcesDir, 'app.asar')
  const executablePath = path.join(appOutDir, 'QuizMate.exe')

  if (!fs.statSync(asarPath).isFile()) throw new Error(`Missing packaged ASAR: ${asarPath}`)
  if (!fs.statSync(executablePath).isFile()) throw new Error(`Missing packaged executable: ${executablePath}`)

  // PE 头校验：必须是 32 位 (machine=0x14c)，保证单安装包兼容 x64 与 32 位 Windows
  const exeBuf = fs.readFileSync(executablePath)
  const peOff = exeBuf.readUInt32LE(0x3c)
  const machine = exeBuf.readUInt16LE(peOff + 4)
  if (machine !== 0x14c) {
    throw new Error(`Unexpected PE machine=0x${machine.toString(16)} in ${executablePath}; expected 0x14c (i386)`)
  }

  const extractDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quizmate-asar-'))
  try {
    extractAll(asarPath, extractDir)
    const packagePath = path.join(extractDir, 'package.json')
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
    if (packageJson.main !== 'out/main/index.js') throw new Error(`Unexpected main entry: ${packageJson.main}`)

    const mainPath = path.join(extractDir, packageJson.main)
    if (!fs.statSync(mainPath).isFile()) throw new Error(`Missing main entry: ${mainPath}`)

    const packagedRequire = createRequire(packagePath)
    const uuid = packagedRequire('uuid')
    if (typeof uuid.v4 !== 'function') throw new Error('Packaged uuid module did not expose v4()')

    // koffi 原生模块必须存在（32 位用户态二进制由 koffi 自带）
    const koffiDir = path.join(extractDir, 'node_modules', 'koffi')
    if (!fs.statSync(koffiDir).isDirectory()) throw new Error(`Missing koffi module: ${koffiDir}`)

    process.stdout.write(`PACKAGED_APP_OK version=${packageJson.version} arch=i386 asar=${fs.statSync(asarPath).size}\n`)
  } finally {
    fs.rmSync(extractDir, { recursive: true, force: true })
  }
}

module.exports = async (context) => verify(context.appOutDir)

if (require.main === module) {
  const appOutDir = process.argv[2]
  if (!appOutDir) throw new Error('Usage: node scripts/verify-packaged-app.cjs <app-out-dir>')
  verify(path.resolve(appOutDir)).catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
