const functions = require('firebase-functions');
const admin     = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

/* ── Yardımcı: token'a push gönder ── */
async function sendPush(token, title, body, url) {
  if (!token) return;
  const message = {
    token,
    notification: { title, body },
    webpush: {
      notification: {
        title,
        body,
        icon : 'https://raw.githubusercontent.com/heftreng49/depo/master/icons/icon-192.png',
        badge: 'https://raw.githubusercontent.com/heftreng49/depo/master/icons/icon-72.png',
      },
      fcm_options: { link: url || 'https://heft-reng.blogspot.com' }
    }
  };
  try {
    await admin.messaging().send(message);
  } catch (e) {
    /* Token geçersizse Firestore'dan sil */
    if (e.code === 'messaging/registration-token-not-registered' ||
        e.code === 'messaging/invalid-registration-token') {
      await db.collection('users').where('fcmToken', '==', token)
        .limit(1).get()
        .then(snap => snap.forEach(d => d.ref.update({ fcmToken: admin.firestore.FieldValue.delete() })))
        .catch(() => {});
    }
  }
}

/* ══════════════════════════════════════════════════════════
 *  1) userNotifs'e yeni belge eklenince push gönder
 *     Tetikleyici: userNotifs/{uid}/msgs/{msgId}  (create)
 * ══════════════════════════════════════════════════════════ */
exports.onNewNotif = functions
  .region('europe-west1')
  .firestore
  .document('userNotifs/{uid}/msgs/{msgId}')
  .onCreate(async (snap, ctx) => {
    const uid  = ctx.params.uid;
    const data = snap.data();

    /* Hedef kullanıcının fcmToken'ını al */
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) return null;
    const token = userDoc.data().fcmToken;
    if (!token) return null;

    const title = data.title || 'Heftreng';
    const body  = data.sub    data.body  '';
    const url   = data.url   || 'https://heft-reng.blogspot.com';

    return sendPush(token, title, body, url);
  });

/* ══════════════════════════════════════════════════════════
 *  2) Mesajlaşma: yeni mesaj gelince alıcıya push
 *     Tetikleyici: messages/{cid}/msgs/{msgId}  (create)
 * ══════════════════════════════════════════════════════════ */
exports.onNewMessage = functions
  .region('europe-west1')
  .firestore
  .document('messages/{cid}/msgs/{msgId}')
  .onCreate(async (snap, ctx) => {
    const data      = snap.data();
    const senderUid = data.uid;

    /* Konuşmadan alıcıyı bul */
    const convDoc = await db.collection('conversations').doc(ctx.params.cid).get();
    if (!convDoc.exists) return null;
    const conv    = convDoc.data();
    const members = conv.members || [];
    const recipientUid = members.find(m => m !== senderUid);
    if (!recipientUid) return null;

    /* Alıcının fcmToken'ı */
    const userDoc = await db.collection('users').doc(recipientUid).get();
    if (!userDoc.exists) return null;
    const token = userDoc.data().fcmToken;
    if (!token) return null;

    /* Gönderenin adı */
    const senderDoc = await db.collection('users').doc(senderUid).get();
    const senderName = senderDoc.exists ? (senderDoc.data().displayName || 'Heftreng') : 'Heftreng';

    const body = data.text
      ? data.text.substr(0, 80)
      : (data.imageUrl ? '📷 Fotoğraf' : 'Yeni mesaj');

    const url = 'https://heft-reng.blogspot.com/p/mesajlar_01024829108.html';

    return sendPush(token, senderName, body, url);
  });
