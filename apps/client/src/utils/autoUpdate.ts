import { Modal } from 'ant-design-vue'
import { createVersionPolling } from 'version-polling'

export function autoUpadte() {
  try {
    createVersionPolling({
      pollingInterval: 60 * 1000,
      silent: import.meta.env.MODE === 'development',
      onUpdate: (self) => {
        Modal.confirm({
          title: '系统提示！',
          content: '系统有更新，刷新页面以获取最新版本。使用旧版本可能会影响您的使用体验哦~',
          okText: '刷新',
          cancelText: '稍后我自己刷新',
          onOk: () => {
            self.onRefresh()
          },
          onCancel: () => {
            self.onCancel()
          },
        })
      },
    })
  } catch (error) {
    console.error('autoUpadte error:', error)
  }
}
