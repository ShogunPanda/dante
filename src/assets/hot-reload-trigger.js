function startSyncing() {
  let lastStatus = null
  let open = false

  const events = new EventSource('/__status')

  events.addEventListener('open', e => {
    open = true
  })

  events.addEventListener('sync', ev => {
    const update = JSON.parse(ev.data)

    // When the status has changedf
    if (lastStatus && update.status !== lastStatus && ['success', 'failed'].includes(update.status)) {
      // Wait for some time before reloading. For most talks this will end up reloading when compilation has ended.
      setTimeout(() => {
        location.reload()
      }, 1000)
    }

    lastStatus = update.status
  })

  events.addEventListener('end', e => {
    events.close()
  })

  events.addEventListener('error', event => {
    if (open) {
      open = false
      console.debug('Synchronization connection lost, reconnecting ...', event)

      setTimeout(() => location.reload(), 1000)
    } else {
      console.error('Synchronization connection failed.', event)
    }
  })
}

startSyncing()
