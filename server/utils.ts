import os from 'os'
export function getIPV4Address () {
  const interfaces = os.networkInterfaces()
  for (const devName in interfaces) {
    //
    // console.log(devName)
    const iface = interfaces[devName]
    // console.log(iface)
    for (let i = 0; i < iface.length; i++) {
      const alias = iface[i]
      // console.log(alias)
      if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
        return alias.address
      }
    }
  }
  return null
}
