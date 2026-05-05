export function buildWeeklySummaryPrompt(
  groupName: string,
  weekStart: Date,
  weekEnd: Date,
  messages: Array<{ sender_name: string; body: string; timestamp: Date }>,
): string {
  const startStr = weekStart.toLocaleDateString('tr-TR');
  const endStr = weekEnd.toLocaleDateString('tr-TR');

  const messageLog = messages
    .map((m) => {
      const time = new Date(m.timestamp).toLocaleString('tr-TR', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
      return `[${time}] ${m.sender_name}: ${m.body}`;
    })
    .join('\n');

  return `Aşağıda "${groupName}" WhatsApp grubunun ${startStr} - ${endStr} tarihleri arasındaki mesajları yer almaktadır.

Bu mesajlardan haftalık bir özet oluştur. Özetin şunları içermesi gerekiyor:

1. *Bu Hafta Neler Oldu?* — Önemli konuşmaları ve kararları özetle (3-5 madde)
2. *Oluşturulan Görevler* — @Maradona ile oluşturulan görevleri listele (varsa)
3. *Öne Çıkan Konular* — Sık tekrarlanan veya kritik konuları belirt
4. *Bir Sonraki Haftaya Taşınanlar* — Çözüme kavuşmamış konular (varsa)

Formatlamada WhatsApp uyumlu kullan: *kalın* için yıldız, _italik_ için alt çizgi.
Yanıt dili, grubun kullandığı dil olsun (Türkçe ise Türkçe, İngilizce ise İngilizce).
Maksimum 600 kelime.

--- MESAJLAR ---
${messageLog}
--- SON ---`;
}
