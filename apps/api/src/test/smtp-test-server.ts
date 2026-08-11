import net from "node:net";

/**
 * A message the fake relay actually accepted, as it came off the wire.
 *
 * `data` is the raw DATA payload — headers and MIME body — so a test can assert
 * on what was *delivered* (recipients, Subject header, the presence of both a
 * text/plain and a text/html part) rather than on what the adapter claims it
 * sent.
 */
interface ReceivedMail {
  mailFrom: string;
  rcptTo: string[];
  data: string;
}

export interface SmtpTestServer {
  port: number;
  received: ReceivedMail[];
  /** Addresses this relay rejects at RCPT TO, simulating a relay-level failure. */
  rejectRecipients: Set<string>;
  close(): Promise<void>;
}

const CRLF = "\r\n";

/**
 * Decode a quoted-printable MIME part back to text.
 *
 * nodemailer encodes any part that is not plain short ASCII, wrapping it at 76
 * columns with `=` soft breaks — so an assertion on a delivered sentence has to
 * undo that first, or it is really an assertion about line wrapping.
 */
export function decodeQuotedPrintable(input: string): string {
  const unfolded = input.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < unfolded.length; i++) {
    const hex = unfolded.slice(i + 1, i + 3);
    if (unfolded[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(hex)) {
      bytes.push(parseInt(hex, 16));
      i += 2;
      continue;
    }
    bytes.push(...Buffer.from(unfolded[i]!, "utf8"));
  }
  return Buffer.from(bytes).toString("utf8");
}

/** Strip the angle brackets SMTP wraps a path in: `<a@b>` → `a@b`. */
function unwrapPath(arg: string): string {
  return arg.trim().replace(/^<|>$/g, "");
}

/**
 * Start a minimal in-process SMTP relay on an ephemeral port.
 *
 * Hermetic on purpose: no container, no Ethereal account, no network. It speaks
 * just enough of RFC 5321 for nodemailer to complete a real session — EHLO with
 * an AUTH advertisement, AUTH PLAIN/LOGIN, MAIL FROM, RCPT TO, DATA — which is
 * what makes "the message arrived" an assertion about bytes on a socket instead
 * of a mocked `sendMail` returning success.
 */
export async function startSmtpTestServer(): Promise<SmtpTestServer> {
  const received: ReceivedMail[] = [];
  const rejectRecipients = new Set<string>();

  const server = net.createServer((socket) => {
    let buffer = "";
    let inData = false;
    let awaitingAuthUser = false;
    let awaitingAuthPass = false;
    let current: ReceivedMail = { mailFrom: "", rcptTo: [], data: "" };

    const send = (line: string) => socket.write(line + CRLF);

    send("220 dragons-test ESMTP");

    socket.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");

      let index: number;
      while ((index = buffer.indexOf(CRLF)) !== -1) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + CRLF.length);

        if (inData) {
          if (line === ".") {
            inData = false;
            received.push(current);
            current = { mailFrom: "", rcptTo: [], data: "" };
            send("250 2.0.0 Ok: queued");
          } else {
            // Undo dot-stuffing so the body reads as it was written.
            current.data += (line.startsWith("..") ? line.slice(1) : line) + "\n";
          }
          continue;
        }

        if (awaitingAuthUser) {
          awaitingAuthUser = false;
          awaitingAuthPass = true;
          send("334 UGFzc3dvcmQ6");
          continue;
        }
        if (awaitingAuthPass) {
          awaitingAuthPass = false;
          send("235 2.7.0 Authentication successful");
          continue;
        }

        const [verb = "", ...rest] = line.split(" ");
        const arg = rest.join(" ");

        switch (verb.toUpperCase()) {
          case "EHLO":
            send("250-dragons-test");
            send("250-AUTH PLAIN LOGIN");
            send("250 8BITMIME");
            break;
          case "HELO":
            send("250 dragons-test");
            break;
          case "AUTH":
            if (arg.toUpperCase().startsWith("LOGIN") && arg.split(" ").length === 1) {
              awaitingAuthUser = true;
              send("334 VXNlcm5hbWU6");
            } else {
              send("235 2.7.0 Authentication successful");
            }
            break;
          case "MAIL":
            current.mailFrom = unwrapPath(arg.replace(/^FROM:/i, "").split(" ")[0] ?? "");
            send("250 2.1.0 Ok");
            break;
          case "RCPT": {
            const address = unwrapPath(arg.replace(/^TO:/i, "").split(" ")[0] ?? "");
            if (rejectRecipients.has(address)) {
              send("550 5.1.1 No such user here");
            } else {
              current.rcptTo.push(address);
              send("250 2.1.5 Ok");
            }
            break;
          }
          case "DATA":
            inData = true;
            send("354 End data with <CR><LF>.<CR><LF>");
            break;
          case "RSET":
            current = { mailFrom: "", rcptTo: [], data: "" };
            send("250 2.0.0 Ok");
            break;
          case "QUIT":
            send("221 2.0.0 Bye");
            socket.end();
            break;
          default:
            send("250 2.0.0 Ok");
        }
      }
    });

    // A client that drops the connection mid-session is normal here.
    socket.on("error", () => undefined);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("SMTP test server did not bind to a TCP port");
  }

  return {
    port: address.port,
    received,
    rejectRecipients,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}
