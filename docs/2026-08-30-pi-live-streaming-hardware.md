# Live streaming gym games from a Raspberry Pi — hardware findings

Date: 2026-08-30. Research against primary sources (raspberrypi.com documentation and product
briefs, the raspberrypi/documentation and FFmpeg/FFmpeg source repositories, ffmpeg.org docs,
YouTube Live help). Secondary sources are used only where marked.

Scope: the club already owns a streaming camera (exact model still unknown). The question is
which Pi and which adapter parts to buy so a Pi can take that camera's signal, optionally
composite the live scoreboard overlay (the score data already lives on the Pi via the
Stramatel tap, see `apps/pi`), and push RTMP(S) to YouTube Live.

## TL;DR recommendation

Buy a **Raspberry Pi 5 (8GB, list $175)** with the **official 27W USB-C PSU (~$14)** and the
**official Active Cooler (~$5)**, plus the adapter for whichever output the camera turns out
to have. The Pi 5 has no hardware H.264 encoder, but Raspberry Pi's own docs say its software
encoder "will still easily achieve 1080p30", and software encode is the only path that also
supports overlay compositing without extra plumbing. A **Pi 4B (4GB, list $100)** is the
budget fallback: its hardware encoder tops out at exactly the 1080p30 target, but every pixel
of overlay work competes with a much slower CPU. Skip the Pi Zero 2 W.

Shopping list by camera-output case (buy after identifying the camera's outputs):

| Case | Extra hardware | Rough price |
|---|---|---|
| Camera has HDMI out | USB 3.0 HDMI-to-UVC capture stick: MS2130-class generic (~15–25 EUR, secondary pricing) or Elgato Cam Link 4K (~130 EUR) | 15–130 EUR |
| Camera is an IP cam (RTSP/RTMP out) | Nothing — Ethernet cable to the Pi | 0 EUR |
| Camera is already a UVC/USB webcam | Nothing — plugs into a Pi USB 3.0 port | 0 EUR |
| All cases | Pi 5 8GB + 27W PSU + Active Cooler + 64GB A2 microSD + Ethernet cable | ~$200 + card/cable |
| Audio, if the camera path carries none | Any USB audio-class mic or interface | 20–80 EUR |

Total incremental spend: roughly **220–350 EUR** depending on the HDMI-dongle choice.
Upstream bandwidth needed at the gym: about **5 Mbps sustained** for a 4 Mbps 720p30 or a
conservative 1080p30 stream (YouTube's recommended H.264 bitrate for 240p–720p30 is 4 Mbps
and for 1080p30 is 10 Mbps; a 1080p30 stream at 4–6 Mbps still transcodes fine).

---

## 1. Pi model encoding capability

### Pi 4B: hardware H.264 encode, 1080p30 max

The official Pi 4 product brief lists under Multimedia: "H.265 (4Kp60 decode); H.264
(1080p60 decode, 1080p30 encode)" — hardware H.264 encode exists and tops out at 1080p30.
([Pi 4 product brief, PDF](https://datasheets.raspberrypi.com/rpi4/raspberry-pi-4-product-brief.pdf))
The same numbers appear on the BCM2711 entry of the processors documentation page.
([raspberrypi.com/documentation/computers/processors.html](https://www.raspberrypi.com/documentation/computers/processors.html))

The encoder is exposed to Linux as a V4L2 memory-to-memory device; the official camera docs'
GStreamer examples use `v4l2h264enc` / `v4l2h264dec` "on a Raspberry Pi 4B or earlier device"
and explicitly substitute software elements on a Pi 5.
([camera docs, streaming section](https://www.raspberrypi.com/documentation/computers/camera_software.html#stream-video-over-a-network-with-rpicam-apps))

### Pi 5: hardware H.264 encoder removed; software encode confirmed viable

Confirmed from two official sources:

- The Pi 5 product brief's feature list names a "4Kp60 HEVC decoder" and **no video encoder
  of any kind** — the only hardware codec on BCM2712 is the HEVC decoder.
  ([Pi 5 product brief, PDF](https://datasheets.raspberrypi.com/rpi5/raspberry-pi-5-product-brief.pdf))
- The camera software documentation states it outright: "Raspberry Pi 5 uses software video
  encoders." It adds that these have longer latency than the old hardware encoders, mitigated
  with `rpicam-vid --low-latency`, and — the decisive line for this project — that even with
  that option the encoder "will still easily achieve 1080p30".
  ([camera docs, rpicam-vid section](https://www.raspberrypi.com/documentation/computers/camera_software.html#rpicam-vid))

On headroom: the official processors page quotes measured CPU costs on BCM2712 of roughly
30–40% of CPU for 1080p30 H.264 software encode and 50–60% for 1080p60 software decode
([processors.html](https://www.raspberrypi.com/documentation/computers/processors.html)),
on a CPU the product brief describes as a 2.4GHz quad-core Cortex-A76 delivering "a 2–3×
increase in CPU performance relative to Raspberry Pi 4". That leaves two-plus cores free for
overlay compositing, audio, and the RTMP mux — which is why the Pi 5 wins here despite
losing the hardware block.

### Pi Zero 2 W: has the encoder, wrong board for the job

The Zero 2 W product brief lists "H.264 encode (1080p30)" hardware — but also 512MB RAM,
a single 1GHz Cortex-A53 quad, **2.4GHz-only** 802.11b/g/n WiFi, no Ethernet, and one USB 2.0
OTG port.
([Zero 2 W product brief, PDF](https://datasheets.raspberrypi.com/rpizero2/raspberry-pi-zero-2-w-product-brief.pdf))
No wired network at a gym full of phones on 2.4GHz, no USB 3.0 for a capture dongle, and no
CPU headroom for overlay. Only defensible as a plain RTSP-to-RTMP relay (case 2 below, copy
mode), and even then the WiFi-only uplink is the weak link. Not recommended.

### Which to buy

**Pi 5.** The overlay goal decides it: compositing forces a decode → filter → re-encode
pipeline (see section 3), and on a Pi 4 that filter stage runs on a much slower CPU next to
a hardware encoder capped at exactly 1080p30 with no margin. On a Pi 5 the entire pipeline is
CPU-bound but the CPU is 2–3× faster, and Raspberry Pi documents 1080p30 software encode as
comfortably within reach. The 8GB variant ($175 list per the product brief) buys filter and
buffer headroom; 4GB ($110) works if the budget is tight.

## 2. Getting the existing camera's signal into the Pi

Three cases, depending on what the camera exposes. Identify the camera model first; the
adapter purchase follows from it.

### Case 1: camera has HDMI out → USB HDMI-to-UVC capture stick

An HDMI capture stick enumerates as a standard USB Video Class (UVC) webcam; Raspberry Pi OS
supports UVC devices out of the box via the kernel `uvcvideo` driver — the official docs
cover USB webcam capture as a supported path.
([Use a USB webcam](https://www.raspberrypi.com/documentation/computers/camera_software.html#use-a-usb-webcam))

- **Elgato Cam Link 4K** (primary source: Elgato product page): input up to 1080p60 and
  4K30 over HDMI (unencrypted), requires a "USB 3.0 port, Type A or Type C", works as a
  standard webcam with no drivers.
  ([elgato.com Cam Link 4K](https://www.elgato.com/us/en/p/cam-link-4k))
- **MS2130-class generic sticks** (secondary — MacroSilicon publishes no English datasheet;
  behavior is community-verified): USB 3.0 UVC device delivering 1080p60 as YUY2 or MJPEG.
  The older MS2109 class is USB 2.0 and reaches 1080p30 only as MJPEG. Either works on a Pi;
  buy a USB 3.0 (MS2130-class) stick so the capture arrives uncompressed and no MJPEG decode
  step is needed.

Bandwidth math says use the Pi's USB 3.0 ports (both Pi 4B and Pi 5 have two 5Gbps ports per
their product briefs): raw 1080p30 YUY2 is ~1 Gbps, beyond USB 2.0's 480 Mbps. On USB 2.0
you would be forced through MJPEG plus a software decode.

Can the Pi handle 1080p UVC capture + encode? Yes on both candidates: capture itself is
DMA-light; the cost is the encode, which is the same hardware block (Pi 4) or the same
software encoder (Pi 5) discussed in section 1. ffmpeg reads the stick via its
`video4linux2` input device (`-f v4l2 -input_format ...  -i /dev/video0`; formats listable
with `-list_formats all`).
([ffmpeg-devices.html](https://ffmpeg.org/ffmpeg-devices.html#video4linux2_002c-v4l2))

Audio: Cam Link-class devices also expose HDMI audio as a USB audio capture device (verify
on the concrete stick once the camera is known — MS2130 audio behavior is community-reported,
not vendor-documented).

### Case 2: camera is an IP camera with RTSP/RTMP output → Pi as relay or overlay box

No adapter hardware at all — camera and Pi meet over the network. Two operating modes with
very different CPU cost:

- **Plain relay (stream copy):** `ffmpeg -i rtsp://camera/... -c copy -f flv
  rtmp://a.rtmp.youtube.com/live2/KEY`. ffmpeg's stream copy mode forwards packets without
  decoding or encoding — "Since there is no decoding or encoding, it is very fast and there
  is no quality loss" — so any Pi model can do this; the camera's own encoder settings must
  then already satisfy YouTube (H.264 + AAC, keyframe interval ≤ 4s).
  ([ffmpeg.html, Streamcopy](https://ffmpeg.org/ffmpeg.html#Streamcopy))
- **Overlay mode (decode + composite + re-encode):** filters are impossible in copy mode —
  "filters work on decoded frames" — so burning in the scoreboard means a full decode →
  overlay → encode pipeline.
  ([ffmpeg.html, Streamcopy](https://ffmpeg.org/ffmpeg.html#Streamcopy))
  On a Pi 4 that is hardware 1080p60-capable H.264 decode, software compositing, hardware
  1080p30 encode; on a Pi 5, software throughout on the faster CPU (the HEVC hardware
  decoder helps only if the camera sends H.265). Capability required: the section-1 encode
  discussion applies unchanged — this is the same load as case 1 plus a decode.

RTSP input and RTMP/RTMPS output are both native ffmpeg protocols; RTMPS is "Real-Time
Messaging Protocol over a secure SSL connection".
([ffmpeg-protocols.html](https://ffmpeg.org/ffmpeg-protocols.html))

### Case 3: camera is already a USB/UVC device

Plug it into a USB 3.0 port; identical to case 1 minus the stick. The official docs'
USB-webcam pages apply directly.
([Use a USB webcam](https://www.raspberrypi.com/documentation/computers/camera_software.html#use-a-usb-webcam))

## 3. Streaming pipeline to YouTube Live

### Encoders

- **Pi 4 hardware path:** ffmpeg exposes the BCM2711 encoder as `h264_v4l2m2m` — the "V4L2
  mem2mem H.264 encoder wrapper", registered in
  [libavcodec/v4l2_m2m_enc.c](https://github.com/FFmpeg/FFmpeg/blob/master/libavcodec/v4l2_m2m_enc.c);
  V4L2 mem2mem HW-assisted codecs landed in FFmpeg 4.0 per the
  [FFmpeg Changelog](https://github.com/FFmpeg/FFmpeg/blob/master/Changelog).
- **Pi 5 software path:** `libx264` (or rpicam-apps' built-in software encoder when the
  source is a CSI camera). Official guidance for low-latency software encode is the
  `--low-latency` rpicam-vid flag, which "suppresses B-frames (on a Raspberry Pi 5 or
  later)".
  ([camera docs, MediaMTX section](https://www.raspberrypi.com/documentation/computers/camera_software.html#stream-video-over-a-network-with-rpicam-apps))

### Push to YouTube

YouTube ingests "RTMP/RTMPS Streaming"; ffmpeg's documented pattern for RTMP output is
`ffmpeg -re -i input -f flv rtmp://server/live/stream`.
([YouTube encoder settings](https://support.google.com/youtube/answer/2853702),
[ffmpeg-protocols.html](https://ffmpeg.org/ffmpeg-protocols.html))

YouTube's current recommended H.264 bitrates (exact table values from the help page):

| Resolution / fps | Recommended H.264 bitrate |
|---|---|
| 1080p60 | 12 Mbps |
| 1080p30 | 10 Mbps |
| 720p60 | 6 Mbps |
| 240p–720p @30 | 4 Mbps |

Keyframe interval: "Recommended 2 seconds", do not exceed 4. Stereo audio: 128 kbps AAC.
([support.google.com/youtube/answer/2853702](https://support.google.com/youtube/answer/2853702))
These are recommendations, not floors — YouTube transcodes whatever arrives — so a 4–6 Mbps
1080p30 stream is a legitimate fit for a gym uplink.

### Scoreboard overlay

The score data is already on the Pi (`apps/pi` tap). Two composition options, both requiring
the re-encode pipeline from section 2:

- ffmpeg `overlay` filter with a scoreboard image the Python payload re-renders on change
  ([ffmpeg-filters, overlay](https://ffmpeg.org/ffmpeg-filters.html#overlay-1));
- rpicam-apps post-processing stages or Picamera2, which the official docs name as the hook
  for altering frames before encode — CSI-camera sources only.
  ([camera docs](https://www.raspberrypi.com/documentation/computers/camera_software.html#stream-video-over-a-network-with-rpicam-apps))

This is the workload that sizes the board: overlay pixels are touched by the CPU every frame,
in addition to encode (and decode in case 2). Hence the Pi 5 recommendation.

### Audio

Neither Pi model has any audio input — the Pi 4 brief lists only a "4-pole stereo audio and
composite video port" (output), the Pi 5 none at all
([Pi 4 brief](https://datasheets.raspberrypi.com/rpi4/raspberry-pi-4-product-brief.pdf),
[Pi 5 brief](https://datasheets.raspberrypi.com/rpi5/raspberry-pi-5-product-brief.pdf)).
Sources that work: HDMI audio through a capture stick (case 1), the IP camera's own audio
track (case 2), or any USB audio-class mic/interface — rpicam-apps records audio via the
`libav` backend's `--libav-audio` / `--audio-device` options against ALSA devices, USB mics
included.
([camera docs, libav options](https://www.raspberrypi.com/documentation/computers/camera_software.html#libav-options))

## 4. Practical constraints at the gym

- **Network:** use Ethernet. Both Pi 4B and Pi 5 have Gigabit Ethernet per their product
  briefs; the Pi 5 jack is PoE+ capable (IEEE 802.3at, needs the PoE+ HAT), the Pi 4B PoE
  (802.3af).
  ([power-supply docs](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html#power-over-ethernet-poe-connector))
  A 10 Mbps stream on shared gym WiFi will stall; the club's existing
  Tailscale/net-watchdog setup on the scoreboard Pi carries over unchanged. Budget ~5 Mbps
  sustained upstream minimum (stream bitrate plus margin).
- **Power:** Pi 4B needs a 5V/3A USB-C supply, Pi 5 the 27W (5V/5A) supply; with only a 3A
  supply the Pi 5 caps USB peripheral current at 600mA — potentially tight with a capture
  stick plus SSD, so buy the official 27W PSU.
  ([power-supply docs](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html#power-supply),
  [Pi 4 brief](https://datasheets.raspberrypi.com/rpi4/raspberry-pi-4-product-brief.pdf))
- **Thermals:** the firmware throttles the Arm cores progressively from 80°C and everything
  at 85°C. A basketball game is 90+ minutes of sustained encode; fit active cooling (official
  Pi 5 Active Cooler / Pi 4 Case Fan) so the encoder never drops frames to throttling.
  ([frequency management and thermal control](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html#frequency-management-and-thermal-control))
- **Storage:** a plain microSD (64GB, A2-class) is fine when the Pi only relays/encodes to
  the network. Record local backup copies of games to a USB SSD rather than the card —
  continuous multi-GB writes are what wears SD cards out. The Pi 5 can also take an NVMe
  drive via the M.2 HAT on its PCIe 2.0 x1 port
  ([Pi 5 brief](https://datasheets.raspberrypi.com/rpi5/raspberry-pi-5-product-brief.pdf)).
  Keep the streaming box separate from the existing scoreboard Pi at first; merging both
  roles onto one Pi 5 is plausible later but couples the score feed's reliability to the
  encode load.

## 5. Open item

Identify the owned camera's exact model and outputs (HDMI? RTSP? UVC?) — that single fact
picks the row in the TL;DR table and settles whether audio rides along or needs a USB mic.
