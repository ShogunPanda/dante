{
  const pendingMessage = document.querySelector('#pending')
  const errorContainer = document.querySelector('#error')
  const errorContents = document.querySelector('#error-content')

  function startSyncing() {
    let open = false
    const events = new EventSource('/__status')

    events.addEventListener('sync', ev => {
      const update = JSON.parse(ev.data)

      switch (update.status) {
        case 'pending':
          pendingMessage.classList.remove('hidden')
          errorContainer.classList.add('hidden')
          errorContents.innerHTML = ''
          break
        case 'success':
          setTimeout(() => location.reload(), 1000)
          break
        case 'failed':
          pendingMessage.classList.add('hidden')
          errorContainer.classList.remove('hidden')
          errorContents.innerHTML = update.payload.error
          break
      }
    })

    events.addEventListener('open', e => {
      open = true
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
}
