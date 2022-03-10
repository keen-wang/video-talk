<template>
  <input v-model="roomId" type="text" placeholder="roomId" />
  <button @click="enterRoom" :disabled="userState !== 'init'">进入房间</button>
  <button @click="leaveRoom" :disabled="userState === 'init'">退出房间</button>
  <fieldset>
    <legend>本地视频</legend>
    <span>status: {{ userState }}</span
    ><br />
    <video
      width="320"
      height="240"
      muted
      :srcObject="localStream"
      controls
      autoplay
      playsinline
    ></video>
  </fieldset>
  <fieldset>
    <legend>远端视频</legend>
    <span>{{}}</span>
    <video
      width="320"
      height="240"
      muted
      :srcObject="remoteUser.remoteStream"
      controls
      autoplay
      playsinline
    ></video>
  </fieldset>
  <div></div>
</template>

<script lang="ts">
// import HelloWorld from './components/HelloWorld.vue';
import { onMounted, reactive, toRefs } from 'vue'
import { io as socketIO, Socket } from 'socket.io-client'

enum UserState {
  Init = 'init',
  Joined = 'joined',
  Connected = 'joined_conn',
  Unbind = 'joined_unbind',
}
export default {
  setup () {
    // let deviceList: MediaDeviceInfo[] = reactive([]);
    // let localStream: MediaStream|null = null;
    const state: {
      deviceList: MediaDeviceInfo[];
      localStream?: MediaStream;
      localStreamList: MediaStream[];
      roomId: string;
      userId: string;
      userState: UserState;
      io?: Socket;
      peerConnection?: RTCPeerConnection;
      pcInfo: {
        offer: any;
        answer: any;
      };
      remoteUser: {
        userId?: number;
        remoteStream?: MediaStream;
      };
    } = reactive({
      deviceList: [],
      roomId: 'video',
      userId: '',
      userState: UserState.Init,
      localStreamList: [],
      localStream: undefined,
      pcInfo: {
        offer: '',
        answer: ''
      },
      remoteUser: {}
    })

    onMounted(async () => {
      state.deviceList = await navigator?.mediaDevices?.enumerateDevices()
      console.log('mediaDevices', state.deviceList)
    })
    async function captureStream () {
      try {
        if (!state.localStream) {
          state.localStream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: 640,
              height: 480,
              frameRate: 15
            },
            audio: true
          })
          state.localStreamList.push(state.localStream)
        }
      } catch (error) {
        console.error('getUserMedia', error)
      }
    }
    function enterRoom () {
      if (!state.io) {
        state.io = socketIO('http://localhost:9966')
      }
      state.io.on('connect', () => {
        console.warn('connect Server')
      })
      state.io.on('joined', (roomId, id) => {
        console.warn('joined', roomId, id)
        state.userState = UserState.Joined
        state.userId = id
        createPeerConnection()
      })
      state.io.on('other_join', (roomId, id) => {
        console.warn(`other_join: user ${id} join in ${roomId}`)
        if (state.userState === UserState.Unbind) {
          debugger
          createPeerConnection()
          bindTracks()
        }
        state.userState = UserState.Connected
        call()
      })
      function leaveRoomHandle (roomId: string) {
        console.log(`join ${roomId} failed`)
        hangup()
        state.io?.close()
        state.io = undefined
        state.userState = UserState.Init
      }
      state.io.on('full', (roomId) => {
        leaveRoomHandle(roomId)
        alert('full: room is full')
      })
      state.io.on('left', (roomId) => {
        leaveRoomHandle(roomId)
        closeLocalMedia()
      })
      state.io.on('bye', (roomId, id) => {
        console.log(`bye: user ${id} leaves room ${roomId}`)
        state.userState = UserState.Unbind
        hangup()
      })
      // 处理接收的 SDP 和 candidate
      state.io.on('message', async (roomId, data) => {
        if (data && data.type) {
          if (data.type === 'offer') {
            state.pcInfo.offer = data.sdp
            await state.peerConnection?.setRemoteDescription(
              new RTCSessionDescription(data)
            )
            // bindTracks()
            debugger
            console.warn('remote offer: setRemoteDescription', data)
            const offerOptions = {
              // offerToReceiveAudio: true,
              // offerToReceiveVideo: true
            }
            const answer = await state.peerConnection?.createAnswer(offerOptions)
            answer && sendAnswer(answer)
          } else if (data.type === 'candidate') {
            const candidate = new RTCIceCandidate({
              sdpMLineIndex: data.label,
              candidate: data.candidate
            })
            // 将远端的候选者信息添加到 pc 中
            await state.peerConnection?.addIceCandidate(candidate)
            console.warn('candidate: add candidate', data)
          } else if (data.type === 'answer') {
            state.pcInfo.answer = data.sdp
            await state.peerConnection?.setRemoteDescription(
              new RTCSessionDescription(data)
            )
            // bindTracks()
            console.warn('answer: setRemoteDescription', data)
          }
        } else {
          console.error('message is invalid!', data)
        }
      })
      // 发送登录房间消息
      state.io.emit('join', state.roomId)
    }
    async function createPeerConnection () {
      console.log('createPeerConnection')
      const config = {
        // iceServers: [
        //   {
        //     urls: "stun:stun.example.org",
        //     username: "xxx",
        //     credential: "xxx",
        //   },
        // ],
        // iceTransportPolicy: "relay",
        // iceCandidatePoolSize: "0",
      }
      if (!state.peerConnection) {
        state.peerConnection = new RTCPeerConnection(config)
        // 接收远端媒体
        state.peerConnection.ontrack = (e) => {
          debugger
          console.warn('get remote stream', e.streams[0])
          state.remoteUser.remoteStream = e.streams[0]
        }
        await bindTracks()
        // 收集候选者
        state.peerConnection.onicecandidate = (e) => {
          if (e.candidate) {
            const msg = {
              type: 'candidate',
              label: e.candidate.sdpMLineIndex,
              id: e.candidate.sdpMid,
              candidate: e.candidate.candidate
            }
            sendMessage(msg)
            console.log('send candidate', msg)
          } else {
            console.log('no candidate')
          }
        }
      } else {
        alert('PeerConnection has been created')
      }
    }
    async function bindTracks () {
      await captureStream()
      // const videoTrack = state.localStream?.getVideoTracks()[0]
      // const audioTrack = state.localStream?.getAudioTracks()[0]
      // 发送本地媒体
      if (state.localStream) {
        const tracks = state.localStream.getTracks()
        debugger
        for (let index = 0; index < tracks.length; index++) {
          const track = tracks[index]

          state.peerConnection?.addTrack(track, state.localStream!)
        }
        console.log('bindTracks', state.localStream.getTracks())
      }
    }
    function sendMessage (data: any) {
      console.log('sendMessage')
      state.io?.emit('message', state.roomId, data)
    }
    function hangup () {
      // 挂起
      console.log('hangup')
      if (!state.peerConnection) {
        return
      }
      state.pcInfo.offer = null
      state.peerConnection.close()
      state.peerConnection = undefined
    }
    /**
     * 主动发起通话
     */
    async function call () {
      // 媒体协商
      console.log('call')
      if (state.userState === UserState.Connected) {
        const offerOptions = {
          offerToReceiveAudio: true,
          offerToReceiveVideo: true
        }
        const offer = await state.peerConnection?.createOffer(offerOptions)
        offer && sendOffer(offer)
      }
    }
    function closeLocalMedia () {
      console.log('closeLocalMedia')
      if (state.localStream) {
        state.localStream.getTracks().forEach((track) => {
          track.stop()
        })
      }
      state.localStream = undefined
    }
    function leaveRoom () {
      state.io?.emit('leave', state.roomId)
      hangup()
      closeLocalMedia()
      state.pcInfo = {
        offer: '',
        answer: ''
      }
      state.userState = UserState.Init
    }
    function sendAnswer (desc: any) {
      console.log('setLocalDescription', desc)
      state.peerConnection?.setLocalDescription(desc)
      state.pcInfo.answer = desc.sdp
      sendMessage(desc)
    }
    function sendOffer (desc: any) {
      console.log('setLocalDescription', desc)
      state.peerConnection?.setLocalDescription(desc)
      state.pcInfo.offer = desc.sdp
      sendMessage(desc)
    }
    return {
      ...toRefs(state),
      enterRoom,
      leaveRoom
    }
  }
}
</script>

<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  margin-top: 60px;
}
</style>
