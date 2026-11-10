---
status: accepted
---

# Accounts are club-managed; the app offers a closure request, not self-service deletion

Every account is created by a club admin in the web admin (`disableSignUp: true`); nobody can sign up in the app or on the web. App Store guideline 5.1.1(v) asks apps that "support account creation" to offer deletion in the app, and Apple's account-deletion page adds that "only offering to temporarily deactivate or disable an account is insufficient". Neither text addresses accounts an organisation provisions for its own staff. Until now the app's "Konto löschen" row opened a pre-filled e-mail to the Datenschutz inbox, which does nothing on a phone with no Mail account.

Decided 2026-11-09: the account stays under the club's control. "Konto löschen" in the native app becomes an in-app closure request: a confirmation explains that the club manages the account and that the referee and staff person records it links to stay, an authenticated API call records the request and mails the Datenschutz inbox from the server, and Profile shows the date the request was made. The club then disables or deletes the account in the web admin under its own process. Every App Store submission carries a review note explaining that accounts are club-provisioned and how closure is requested (`apps/native/RELEASES.md`).

Considered options: self-service deletion through better-auth `deleteUser` was rejected because the club, not the person, decides when a staff login ends, and a deleted login could not be restored by an admin. Keeping the `mailto:` was rejected because it fails without a mail client and is the form Apple names as insufficient. Disabling with no request path was rejected because it leaves nothing in the app for App Review to see.

Consequences: App Review may still read 5.1.1(v) as applying. If a submission is rejected on it, the fallback is to have the closure request delete the login (user row, sessions, push devices, preferences) immediately. That is safe, because the referee and staff person records point away from the account and survive its deletion.
