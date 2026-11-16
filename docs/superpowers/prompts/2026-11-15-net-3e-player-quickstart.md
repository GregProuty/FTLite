# Internet playtest quick start

Use the same Windows x64 package on both computers: `dist/net-3e-final-candidate.zip`.

SHA-256: `882476a79956a4525aab1d15f115722fab940ebcacc48f7869b4c7aa76e0e5d4`.

1. Copy the ZIP to each computer and extract it completely. Run `FTLite.exe` from the extracted folder. The build is unsigned.
2. Put the computers on different networks, such as home broadband and a phone hotspot. Both need internet access. No Cloudflare credentials or `.env` files belong on either computer.
3. On the first computer choose Host and create a two-player room. Send the displayed room code to the other player.
4. On the second computer choose Join and enter that code. Both players choose Ready, then the host starts.
5. Each player moves and operates a console. Try pause/resume, then play together for several minutes. Confirm both see matching game state.
6. Exit normally. Record any visible error, freeze, disconnect or disagreement, and whether both apps closed normally.

The server address is already built into the package. The deployed service and actual forced-TURN gameplay have passed automated tests using two app instances on one computer. Two separate computers have not yet been verified.

For the formal report, host-death recovery, network impairment and forced-relay evidence, follow the [two-machine procedure](2026-11-15-net-3e-two-machine-playtest.md). Ordinary manual play alone does not produce the instrumented evidence required by the release gate. Do not share credentials, network addresses, SDP or raw network dumps in test notes.
