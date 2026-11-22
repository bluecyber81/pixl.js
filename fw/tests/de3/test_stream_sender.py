"""PC encoder vs actual C decoder, and bounded acknowledged transport (no radio)."""
from pathlib import Path
import asyncio,ctypes,importlib.util,random,subprocess,tempfile,types,unittest
HERE=Path(__file__).resolve().parent
FW=HERE.parents[1]
spec=importlib.util.spec_from_file_location('stream_sender',FW/'scripts/stream_video_to_pixl.py')
sender=importlib.util.module_from_spec(spec);spec.loader.exec_module(sender)
class SenderTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory(prefix='stream-cross-');d=Path(cls.tmp.name)
        (d/'bridge.c').write_text('''#include <string.h>\n#include "stream_codec.h"\nstatic stream_codec_t state;\nvoid reset(void){memset(&state,0,sizeof state);stream_codec_reset(&state);}\nunsigned feed(const unsigned char*p,unsigned n){return stream_codec_feed(&state,p,n);}\nvoid copy(unsigned char*p){memcpy(p,state.frame,1024);}\n''')
        src=FW/'application/src/app/ble_stream'
        subprocess.run(['gcc','-std=c11','-O1','-shared','-fPIC','-I',str(src),str(d/'bridge.c'),str(src/'stream_codec.c'),'-o',str(d/'codec.so')],check=True)
        cls.codec=ctypes.CDLL(str(d/'codec.so'));cls.codec.feed.argtypes=[ctypes.c_char_p,ctypes.c_uint];cls.codec.feed.restype=ctypes.c_uint
    @classmethod
    def tearDownClass(cls):cls.tmp.cleanup()
    def decode(self,packet,chunk=20):
        accepted=0
        for off in range(0,len(packet),chunk):accepted+=self.codec.feed(packet[off:off+chunk],len(packet[off:off+chunk]))
        self.assertEqual(accepted,1);out=ctypes.create_string_buffer(1024);self.codec.copy(out);return out.raw
    def test_raw_rle_delta_actual_c(self):
        rng=random.Random(479)
        for chunk in (20,21,64,244,247):
            self.codec.reset();prev=None
            for n,frame in enumerate((bytes(1024),bytes([255])*1024,bytes(rng.randrange(256) for _ in range(1024)),sender.generate_demo_frame(1),sender.generate_demo_frame(2))):
                packet=sender.encode_frame_packet(frame,prev)
                self.assertLessEqual(len(packet),1029)
                self.assertEqual(self.decode(packet,chunk),frame);prev=frame
    def test_force_keyframe_after_reconnect(self):
        frame=sender.generate_demo_frame(3);old=sender.generate_demo_frame(2)
        packet=sender.encode_frame_packet(frame,old,True);self.assertNotEqual(packet[2],2)
        self.codec.reset();self.assertEqual(self.decode(packet),frame)
    def test_frame_and_reference_lengths(self):
        for n in (0,1,1023,1025):
            with self.assertRaises(ValueError):sender.encode_frame_packet(bytes(n))
            with self.assertRaises(ValueError):sender.encode_frame_packet(bytes(1024),bytes(n))
    def test_gray_orientation_and_inversion(self):
        pixels=bytes([255,0,0,0,0,0,0,255])+bytes(8184)
        normal=sender.gray_bytes_to_xbm_128x64(pixels);inv=sender.gray_bytes_to_xbm_128x64(pixels,invert=True)
        self.assertEqual(normal[0],129);self.assertEqual(normal[1:],bytes(1023));self.assertEqual(inv,bytes(b^255 for b in normal))
        for length in (0,8191,8193):
            with self.assertRaises(ValueError):sender.gray_bytes_to_xbm_128x64(bytes(length))
    def test_characteristic_capacity(self):
        for value in (20,21,244,247,512):self.assertEqual(sender.stream_chunk_size(types.SimpleNamespace(max_write_without_response_size=value)),min(247,value))
        with self.assertRaises(RuntimeError):sender.stream_chunk_size(types.SimpleNamespace(max_write_without_response_size=0))
    def test_ffmpeg_filters(self):
        for mode in sender.SCALE_MODES:
            self.assertIn('128:64',sender.build_vf_filter(5,mode));self.assertIn('format=gray',sender.build_vf_filter(5,mode))
class FlowTests(unittest.IsolatedAsyncioTestCase):
    async def test_unknown_rssi_and_fragmented_ack(self):
        a=sender.StreamAcks();a.receive(None,b'unknown\nRSSI:bad\nRSSI:-51\nAC');a.receive(None,b'K1\n')
        await a.expect(b'ACK1');self.assertEqual(a.rssi,-51);self.assertTrue(a.replies.empty())
    async def test_timeout_and_wrong_ack(self):
        a=sender.StreamAcks()
        with self.assertRaises(RuntimeError):await a.expect(b'ACK1',timeout=.001)
        a.receive(None,b'OK\n')
        with self.assertRaises(RuntimeError):await a.expect(b'ACK1')
    async def test_notification_bound(self):
        a=sender.StreamAcks();a.receive(None,b'x'*129)
        with self.assertRaises(RuntimeError):await a.expect(b'OK')
        a=sender.StreamAcks();a.receive(None,b'OK\nOK\nOK\n')
        self.assertEqual(a.replies.qsize(),2)
        with self.assertRaises(RuntimeError):await a.expect(b'OK')
    async def test_one_outstanding_chunk(self):
        for size in (20,247):
            a=sender.StreamAcks();sent=[];outstanding=False
            class Client:
                async def write_gatt_char(inner,characteristic,data,response):
                    nonlocal outstanding
                    self.assertFalse(outstanding);self.assertFalse(response);self.assertLessEqual(len(data),size);outstanding=True;sent.append(bytes(data))
                    def consumed():
                        nonlocal outstanding
                        outstanding=False;a.receive(None,b'OK\n')
                    asyncio.get_running_loop().call_soon(consumed)
            rng=random.Random(479)
            packet=sender.encode_frame_packet(bytes(rng.randrange(256) for _ in range(1024)))
            self.assertEqual(len(packet),1029)
            await sender.send_stream_packet(Client(),'rx',packet,size,a);self.assertEqual(b''.join(sent),packet);self.assertFalse(outstanding)
    async def test_no_duplicate_after_missing_credit(self):
        sent=[]
        class Client:
            async def write_gatt_char(self,c,data,response):sent.append(bytes(data))
        class Missing:
            async def expect(self,value):raise RuntimeError('lost acknowledgement')
        with self.assertRaises(RuntimeError):await sender.send_stream_packet(Client(),'rx',bytes(100),20,Missing())
        self.assertEqual(sent,[bytes(20)])
if __name__=='__main__':unittest.main()
