// WebRTC for the call, on a phone: installed once, at start-up, before anything can reach for it.
//
// `registerGlobals()` puts react-native-webrtc's `RTCPeerConnection`, `MediaStream` and
// `navigator.mediaDevices` where a browser would have them, with the few web APIs `livekit-client`
// also expects. Both call transports lean on it: LiveKit's for Runway, and Anam's, whose SDK is
// written for a browser and needs nothing a phone lacks once these are in place.
//
// Only where the build has WebRTC in it. Expo Go does not, and LiveKit's setup reaches for its
// native module the moment it runs, so an unconditional call would stop the whole app opening
// there rather than only the call. Without it a call fails to connect, says so, and text carries
// on — the same ladder as any other failed call.
import { NativeModules } from 'react-native'

if (NativeModules.WebRTCModule != null) {
  void import('@livekit/react-native').then(({ registerGlobals }) => registerGlobals())
}
