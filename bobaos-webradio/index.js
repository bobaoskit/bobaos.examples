const MpvInstance = require("mympvspawn");
const MpvClient = require("mympvclient");
const Bobaos = require("bobaos.sub");

const mpvSocketPath = `${__dirname}/mympv.sock`;
const myMpvInstance = MpvInstance({ socketFile: mpvSocketPath, debug: false }).spawn();
const mpv = MpvClient({ socketFile: mpvSocketPath, debug: false });

mpv.on("error", e => {
  console.log(e.message);
});

const radioList = [
  { id: "relx", name: "Relax FM", url: "http://ic3.101.ru:8000/a200" },
  { id: "rock", name: "Rock.FM 95.2", url: "http://nashe1.hostingradio.ru/rock-128.mp3" },
  { id: "baden", name: "Baden.FM", url: "http://stream.baden.fm:8006/badenfm" }
];

let currentRadioIndex = 0;

const connectMpv = _ => {
  return new Promise((resolve, reject) => {
    mpv
      .connect()
      .then(_ => {
        console.log(`mpv client connected`);
        resolve();
      })
      .catch(e => {
        console.log(`can't connect to mpv socket, ${e.message}`);
        console.log(`reconnecting`);
        setTimeout(_ => {
          console.log("reconnect timeout handler");
          connectMpv()
            .then(resolve)
            .catch(reject);
        }, 1000);
      });
  });
};

// datapoints
// play_pause: dpt1, 1:play, 0: pause
// next_prev: dpt1, 1:next, 0: prev
// radio_index: dpt5
// volume: dpt5
const DP_STOP_PLAY_CTRL = 41;
const DP_STOP_PLAY_STAT = 42;
const DP_PREV_NEXT_CTRL = 43;
const DP_RADIO_INDEX_CTLR = 44;
const DP_RADIO_INDEX_STAT = 45;
const DP_RADIO_NAME_STAT = 46;
const DP_VOLUME_CTRL = 47;
const DP_VOLUME_STAT = 48;

let bobaos = Bobaos({ redis: "redis://10.0.42.36:6379" });

bobaos.on("ready", async _ => {
  try {
    await connectMpv();

    let values = [];
    // get volume
    let volume = parseInt((await mpv.getProperty("volume")).data);
    volume = Math.floor((255 * volume) / 100);
    values.push({ id: DP_VOLUME_STAT, value: volume });
    values.push({ id: DP_STOP_PLAY_STAT, value: false });
    values.push({ id: DP_RADIO_INDEX_STAT, value: currentRadioIndex });
    values.push({ id: DP_RADIO_NAME_STAT, value: radioList[currentRadioIndex].name });
    await bobaos.setValue(values);
  } catch (e) {
    console.log(e);
  }
});

const processBaosValue = async payload => {
  if (Array.isArray(payload)) {
    return payload.forEach(processBaosValue);
  }

  let { id, value, raw } = payload;
  if (id === DP_VOLUME_CTRL) {
    let volume = Math.floor((value * 100) / 255);
    try {
      // send to mpv
      await mpv.volume(volume);
      // get feedback
      volume = parseInt((await mpv.getProperty("volume")).data);
      volume = Math.floor((255 * volume) / 100);
      await bobaos.setValue({ id: DP_VOLUME_STAT, value: volume });
    } catch (e) {
      console.log(e);
    }
  }
  if (id === DP_PREV_NEXT_CTRL) {
    if (value) {
      // next
      if (currentRadioIndex < radioList.length - 1) {
        currentRadioIndex += 1;
      } else {
        // circle has no end
        currentRadioIndex = 0;
      }
    } else {
      // prev
      if (currentRadioIndex > 0) {
        currentRadioIndex -= 1;
      } else {
        // circle has no beginning
        // who is able to exhaust it?
        currentRadioIndex = radioList.length - 1;
      }
    }

    try {
      await mpv.loadfile(radioList[currentRadioIndex].url);
      let values = [];
      values.push({ id: DP_RADIO_INDEX_STAT, value: currentRadioIndex });
      values.push({ id: DP_RADIO_NAME_STAT, value: radioList[currentRadioIndex].name });
      await bobaos.setValue(values);
    } catch (e) {
      console.log(e);
    }
  }
  if (id === DP_STOP_PLAY_CTRL) {
    try {
      let values = [];
      if (value) {
        // play
        await mpv.stop();
        await mpv.loadfile(radioList[currentRadioIndex].url);
        values.push({ id: DP_RADIO_INDEX_STAT, value: currentRadioIndex });
        values.push({ id: DP_RADIO_NAME_STAT, value: radioList[currentRadioIndex].name });
        values.push({ id: DP_STOP_PLAY_STAT, value: true });
      } else {
        // pause
        await mpv.stop();
        values.push({ id: DP_STOP_PLAY_STAT, value: false });
      }
      await bobaos.setValue(values);
    } catch (e) {
      console.log(e);
    }
  }
  if (id === DP_RADIO_INDEX_CTLR) {
    if (value < radioList.length) {
      try {
        await mpv.loadfile(radioList[value].url);
        currentRadioIndex = value;
        let values = [];
        values.push({ id: DP_RADIO_INDEX_STAT, value: currentRadioIndex });
        values.push({ id: DP_RADIO_NAME_STAT, value: radioList[currentRadioIndex].name });
        await bobaos.setValue(values);
      } catch (e) {
        console.log(e);
      }
    }
  }
};

bobaos.on("datapoint value", processBaosValue);
