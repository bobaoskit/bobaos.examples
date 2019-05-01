# bobaos-webradio

Simple implementation of stream playing with KNX controls.

Objects:

```text
41 DPT1. playing control. 0 - stop, 1 - play
42 DPT1. playing state.
43 DPT1. prev/next stream control. 0 - prev, 1 - next.
44 DPT5. radio index direct control. 
45 DPT5. current radio index status.
46 DPT16. current radio name.
47 DPT5. volume control.
48 DPT5. volume status.
```

This module requires `mpv` media player installed on your system.
