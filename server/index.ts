import express from 'express'
import http from 'http'
import { Server as SocketIO, Socket } from 'socket.io'
import cors from 'cors'

const app = express()
app.use(cors())
// 解决跨域
app.all('*', function (req, res, next) {
  // app.use(function (req, res, next) {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Headers', 'Content-Type, Content-Length, Authorization, Accept, X-Requested-With')
  res.header('Access-Control-Allow-Methods', 'PUT, POST, GET, DELETE, OPTIONS')
  if (req.method === 'OPTIONS') {
    res.send(200)
  } else {
    next()
  }
})

const maxUserCount = 2

const server = http.createServer(app)
server.listen(9966, () => {
  // @ts-ignore
  const host = server.address().address
  // @ts-ignore
  const port = server.address().port
  console.log(`应用实例，访问地址为 http://${host}:${port}`)
  console.log('server is running', 'ws://localhost:8866')
})
const io = new SocketIO(server, {
  cors: {
    origin: '*'
  }
})
io.on('connection', (client) => {
  console.log('client connect')
  // 收到 message 进行转发
  client.on('message', (roomID, message) => {
    console.log('message', roomID, message)
    client.to(roomID).emit('message', roomID, message)
  })

  client.on('join', (roomID) => {
    // @ts-ignore
    const myRoom: any = io.sockets.adapter.rooms.get(roomID)
    // 获取房间人数
    let users = myRoom ? myRoom.size : 0
    if (users < maxUserCount) {
      client.join(roomID)
      client.emit('joined', roomID, client.id)
      users = myRoom ? myRoom.size : 0
      if (users > 1) {
        client.to(roomID).emit('other_join', roomID, client.id)
      }
    } else {
      client.emit('full', roomID, client.id)
    }
  })

  client.on('leave', (roomID) => {
    client.leave(roomID)
    const myRoom: any = io.sockets.adapter.rooms.get(roomID)
    // 获取房间人数
    const users = myRoom ? Object.keys(myRoom.sockets || {}).length : 0
    console.log('current user count: ', users)
    client.to(roomID).emit('bye', roomID, client.id)
    client.emit('left', roomID, client.id)
  })
  client.on('event', (data: any) => {
    console.log('data', data)
  })
  client.on('disconnect', () => { /* … */ })
})
