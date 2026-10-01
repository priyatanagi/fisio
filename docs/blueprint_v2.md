# Blueprint: Fisio Architect 2.0 (Final)

Dokumen ini berisi rancangan pembaruan untuk aplikasi Fisio Architect yang telah disetujui. Implementasi akan dimulai dari **Penyimpanan Database Lokal (IndexedDB)** terlebih dahulu.

## 1. Informasi Profil Pengguna (Brand Profile)
Untuk menghasilkan konten yang benar-benar relevan dengan bisnis pengguna secara universal, profil perlu menyimpan data berikut:

### Informasi Bisnis Dasar
*   **Nama Bisnis/Brand:** (misal: "Sehat Sentosa")
*   **Bidang Usaha (Niche):** (misal: "Klinik Fisioterapi", "E-commerce Sepatu", "SaaS")
*   **Lokasi Bisnis (Geografi):** (misal: "Jakarta Selatan, Indonesia")
*   **Target Pasar (Demografi):** (misal: "Pekerja kantoran usia 25-45 tahun dengan keluhan nyeri punggung")

### Strategi & Komunikasi
*   **Unique Selling Proposition (USP):** Apa yang membedakan bisnis ini dari kompetitor?
*   **Gaya Bahasa (Tone of Voice):** (Pilihan: Profesional, Santai & Ramah, Akademis, dsb)
*   **Call to Action (CTA) Default:** Kalimat ajakan bertindak yang selalu disisipkan.

### Aturan Desain & Visual (Untuk Designer AI)
*   **Skema Warna:** Warna Primer (Brand), Sekunder, Aksen, Background, dan Teks.
*   **Tipografi (Font):** Pilihan font untuk Heading dan Body.
*   **Gaya Elemen:** Aturan untuk bentuk tombol, gaya tabel, gaya blok kutipan (blockquote).

---

## 2. Pemisahan Tugas AI (Multi-Agent System)
Kita akan merombak pengaturan Provider sehingga pengguna bisa memilih Model/API Key yang berbeda untuk masing-masing "Role" (Peran):

1.  **Judge:** Brainstorming topik dan mencari ide artikel yang relevan dengan target pasar.
2.  **Impower:** Riset SEO (Keyword, LSI/Secondary keywords, Tags, Title, Meta Description).
3.  **Creator:** Menulis konten utama artikel dalam format Markdown berdasarkan kerangka SEO dari Impower.
4.  **Reviewer/Auditor:** (BARU) Mengecek silang (Fact-check) dan mengaudit SEO dari hasil Creator secara mandiri untuk memastikan kualitas sebelum didesain.
5.  **Designer:** Mengubah Markdown menjadi HTML (Clean & Inline) dengan Live Style Preview dari profil pengguna.

---

## 3. Fitur Batch Generation (CSV) & Antrean (Concurrency)

Pengguna dapat mengunggah file CSV. UI akan menampilkan tabel *Preview* sebelum proses dimulai.
*   **Sistem Antrean Konkuren:** Proses Batch akan dibatasi maksimal 2 atau 3 artikel berjalan bersamaan untuk mencegah Rate Limit Error (429) dari API Provider.
*   **Format Tabel CSV:** `Topic_Idea`, `Focus_Keyphrase`, `Target_Length`, `Tone_Override`.
*   **Alur Kerja UI:**
    1. Upload CSV -> Tampil Tabel Antrean (Pending).
    2. Tombol **"Generate All"**.
    3. Status real-time (Judging -> Impowering -> Creating -> Reviewing -> Designing -> Done).
    4. **Download:** Download baris (ZIP) atau Batch (Folder per artikel ZIP).

---

## 4. Tahapan Implementasi

Sesuai instruksi Anda, urutan pengerjaan adalah sebagai berikut:
1.  **Tahap 1 (PRIORITAS): Migrasi Database (IndexedDB).** Memindahkan penyimpanan `history` artikel dari `localStorage` (yang terbatas 5MB) ke IndexedDB di frontend agar ratusan artikel dari Batch Generate dapat tersimpan dengan aman dan terkontrol.
2.  **Tahap 2:** Pembuatan sistem User Profile.
3.  **Tahap 3:** Restrukturisasi state Provider menjadi Multi-Agent (5 Peran).
4.  **Tahap 4:** Pembuatan UI Preview Designer & modifikasi prompt Designer AI.
5.  **Tahap 5:** Pembuatan fitur Batch Generation (CSV) lengkap dengan antreannya.
