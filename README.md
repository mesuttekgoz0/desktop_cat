# Kedicik 🐱

Masaüstünde 140×140'lık bir yuvada yaşayan küçük kedi.

## Neler yapabiliyor

- **Yuvaya tıkla:** sağda menü açılır (ekranın sağ kenarındaysa solda açılır).
- 🧶 **Yumak:** yumak tepeden düşer, kedi koşup patiler, üstüne atlar. Yere düşen yumağa sen de tıklayıp fırlatabilirsin.
- 🐟 **Mama:** kap gelir, kedi gidip yer, kalpler çıkar.
- 🔴 **Lazer:** 15 saniye boyunca fareyi yuvanın içinde gezdir, kedi noktayı kovalar.
- 🌙 **Uyut / ☀️ Uyandır.**
- **Sevme:** fareyi kedinin üstünde gezdirince mırlar, kalpler çıkar, ara sıra küçük notlar söyler.
- **Sürükleme:** yuvayı basılı tutup istediğin yere taşı. Konum kaydedilir.
- Kendi kendine dolaşır, göz kırpar, kulak oynatır. Gece yarısından sonra kendiliğinden uyuyabilir.
- Pencere gerçek saate göre gündüz, akşam ve gece olur.
- Zamanla acıkır, aç kalınca "acıktı 🐟" der. Durumu uygulama kapansa da kaydedilir.
- ⚙️ **Ayarlar:** boyutu Küçük / Normal / Büyük / Dev olarak değiştir. Seçim kaydedilir.
- Menü çubuğundaki kedi ikonundan gizleme, köşeye getirme, boyut, açılışta başlatma ve çıkış yapılabilir.

## Kişiselleştirme

Sadece `src/ayarlar.js` dosyasını düzenle: isim, renk (`turuncu`, `gri`, `siyah`, `beyaz`, `tekir`), sevilince çıkan mesajlar ve özel günler (`'GG-AA'`).

## Windows'ta deneme

```bash
npm install
npm start
```

## Mac için derleme

**Yol 1: GitHub Actions (Mac'e dokunmadan)**
1. Projeyi GitHub'a yükle.
2. **Actions → "Mac için derle" → Run workflow** butonuna bas.
3. İş bitince sayfanın altındaki **Kedicik-mac** dosyasını indir. İçinde `.dmg` var.

**Yol 2: Onun Mac'inde**
```bash
npm install
npm run dist:mac
```
`dist/` klasöründe `.dmg` oluşur.

## Mac'e kurulum

1. `.dmg` dosyasını aç, Kedicik'i **Applications** klasörüne sürükle.
2. İlk açılışta "doğrulanamadı" uyarısı çıkar. Bunun sebebi Apple geliştirici hesabıyla imzalanmamış olması. Çözüm: **Sistem Ayarları → Gizlilik ve Güvenlik**, en altta **"Yine de Aç"**.
3. "Hasarlı" uyarısı çıkarsa Terminal'de şu komutu çalıştırıp tekrar aç:
   ```bash
   xattr -cr /Applications/Kedicik.app
   ```
4. İlk açılıştan sonra kendini otomatik olarak başlangıç öğelerine ekler. Dock'ta görünmez, sadece menü çubuğunda küçük bir kedi ikonu olur.

## Kedi nasıl hareket ediyor

Kedi tek bir resimden oluşuyor (`src/kedi/kedi-veri.js`). `src/kedi/rig.js` bu resmi küçük üçgenlerden oluşan bir ağa bölüyor ve iskelete bağlıyor: 4 bacak, kafa, 3 eklemli kuyruk, 2 kulak, göz kapakları ve gövde. Yürürken bacaklar sırayla adım atıyor, patiler yerden kalkıyor. Göz kırpma, nefes, yemek yerken eğilme, pati atma, yalanma ve somun gibi uyuma da aynı iskeletle yapılıyor.

Kedinin resmi değişirse `rig.js` içindeki anatomi koordinatlarının (bacak, kafa, kuyruk, göz konumları) yeni resme göre güncellenmesi gerekir.

