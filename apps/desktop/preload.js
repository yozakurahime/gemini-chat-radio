const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('himefitDesktop', {
  platform: process.platform
});

