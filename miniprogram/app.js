// 轻迹 LiteTrace · 应用入口
App({
  onLaunch() {
    // 初始化默认资料（首次启动）
    const store = require('./utils/store')
    if (!wx.getStorageSync(store.K.profile)) {
      store.saveProfile(store.defaultProfile())
    }
  },
  globalData: {}
})
