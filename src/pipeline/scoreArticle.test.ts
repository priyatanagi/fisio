import { describe, it, expect } from 'vitest';
import { scoreDraft, formatFailedChecks } from './scoreArticle';
import type { SeoMetadata } from '../types/article';

const metadata: SeoMetadata = {
  seoTitle: 'Panduan Program Makan Bergizi Gratis',
  headline: 'Panduan Lengkap Program Makan Bergizi Gratis',
  focusKeyphrase: 'makan bergizi gratis',
  metaDescription:
    'Ulasan lengkap program makan bergizi gratis, cara mendaftar, dan syarat penerima manfaat di Indonesia.',
  urlSlug: 'program-makan-bergizi-gratis',
  tags: ['gizi'],
};

const englishMetadata: SeoMetadata = {
  seoTitle: 'How the School Lunch Program Works Every Day',
  headline: 'How the School Lunch Program Works Every Day',
  focusKeyphrase: 'school lunch',
  metaDescription:
    'How the school lunch program feeds every child, who cooks the meals, and what parents need to know about each school day.',
  urlSlug: 'school-lunch-program',
  tags: ['school'],
};

/** Passes 15 of 16 scored checks. The measurer counts vowel groups, which puts Indonesian prose far under the Flesch band. */
const compliant = `## Apa Itu Program Makan Bergizi Gratis?

Program makan bergizi gratis adalah program yang memberi makan siang gratis kepada anak di sekolah. Program ini berjalan dari hari Senin sampai Jumat, dan tidak ada biaya yang dipungut dari orang tua. Dapur makanan ada di dalam sekolah, sehingga makanan bisa langsung diantar ke kelas.

Makanan dimasak pada pagi hari, lalu disajikan saat jam istirahat dimulai. Susunan menu dibuat pada awal pekan agar siswa tidak bosan dengan makanan yang sama. Setiap sekolah membuat menu sendiri mengikuti bahan yang ada di daerah.

## Siapa Sasaran Penerima?

Sasaran utama program makan bergizi gratis adalah anak sekolah dasar dan anak sekolah menengah pertama. Pendaftaran dilakukan pada awal tahun ajaran melalui sekolah masing-masing. Orang tua tidak perlu datang ke kantor pemerintah, cukup mengisi lembar yang diberikan sekolah.

Semua anak yang belajar di sekolah di wilayah program otomatis menjadi penerima. Tidak ada seleksi lebih lanjut, karena dapurnya sudah disiapkan untuk semua siswa. Data penerima diambil dari daftar siswa yang sudah ada di sekolah.

## Bagaimana Distribusi Dilakukan?

Distribusi dilakukan melalui dapur yang dikelola oleh sekolah bersama tenaga kesehatan. Pengambilan makanan berlangsung saat jam istirahat, sebelum pelajaran siang dimulai. Jadwal distribusi berjalan setiap hari kerja, dan tetap sama pada bulan Ramadan.

Sekolah menyiapkan meja makan di kelas, agar siswa tidak berlari saat jam istirahat. Pembagian makanan dilakukan oleh guru kelas yang sedang bertugas pada hari itu. Sisa makanan yang tidak habis dikembalikan ke dapur, dan tidak dipakai lagi. Jam pengambilan dibuat sama setiap hari.

## Siapa yang Menanggung Biaya Program Makan Bergizi Gratis?

Anggaran program ini berasal dari APBN tahun anggaran yang sedang berjalan. Dana dipakai untuk membeli bahan pangan dan untuk membayar tenaga dapur. Pengelolaan dana dilakukan secara terbuka, dan dapat diperiksa oleh sekolah.

Harga bahan pangan di tiap daerah bisa berbeda, karena jarak dan musim yang berbeda. Karena itu, menu disusun memakai bahan yang mudah ada di daerah tersebut. Kualitas makanan dijaga setiap hari sebelum makanan itu diantar ke kelas. Sebagian sekolah menambah porsi dari dana mandiri sebesar **30%**.

## Bagaimana Cara Mendaftarkan Anak?

Orang tua cukup memberi tahu kelas jika ada anak yang berhalangan pada hari itu. Anak yang berhalangan tidak dihitung sebagai penerima pada hari tersebut. Laporan jumlah makanan yang dimasak dibuat setiap hari oleh kepala sekolah.

Penghitungan jumlah porsi dilakukan pada pagi hari, sebelum makanan dikemas. Setiap porsi diberi nomor, agar mudah dihitung saat pembagian. Sisa makanan yang tidak habis langsung dibuang oleh petugas dapur.

## Apa Sasaran Program Tahun Depan?

Program makan bergizi gratis akan diperluas ke sekolah menengah atas pada tahun berikutnya. Jumlah sekolah penerima bertambah setiap tahun, agar semua sekolah bisa ikut. Semua sekolah yang menjadi penerima wajib melaporkan jumlah porsi setiap hari.

Kepala sekolah menjadi penanggung jawab utama atas laporan harian tersebut. Dinas pendidikan melakukan monitoring setiap tiga bulan, lalu memberi pendampingan. Sekolah yang bermasalah akan mendapat pendampingan langsung dari dinas. Guru wali kelas membantu mencatat jumlah anak yang tidak masuk.

## Apa Syarat Sekolah Jadi Penerima?

Sekolah harus punya ruang dapur, meja makan, dan tempat menyimpan bahan pangan. Tenaga dapur perlu dilatih agar tahu cara memasak makanan yang sehat. Alat masak harus lengkap, mulai dari panci, kompor, sampai pengaduk.

Bahan dibeli setiap awal pekan, agar harga masih bagus dan uang cukup. Bahan yang dipakai untuk makanan gratis selalu dihitung jumlah porsinya. Susunan menu dibuat setiap awal pekan, agar bahan mudah dibeli di dekat sekolah.

## Bagaimana Nutrisi Makanan Dijaga?

Nilai gizi makanan diperiksa lebih dulu, sebelum makanan diantar ke kelas. Setiap porsi dibuat setelah jumlah siswa yang hadir sudah diketahui. Air putih selalu tersedia di setiap kelas.

Sayuran dan buah segar tersedia setiap hari. Gula ditambahkan secukupnya saja. Semua bahan dipakai pada hari yang sama. Menu berganti setiap awal pekan agar siswa tidak bosan.

## Apa Tantangan di Lapangan?

Tidak semua sekolah punya dapur yang cukup besar. Sebagian sekolah harus menyewa ruang sebelah. Bagian ini bisa diperbaiki oleh pemerintah.

Tenaga dapur perlu dilatih setiap tahun. Pembelian bahan harus dilakukan lebih awal. Laporan harian dikirim ke dinas pendidikan. Guru yang bertugas hari itu mencatat porsi yang diambil.

## Bagaimana Orang Tua Mengikuti Program Ini?

Orang tua cukup memberi tahu sekolah jika ada anak yang sedang sakit. Anak yang sakit itu tidak dihitung sebagai penerima pada hari tersebut. Orang tua tidak perlu menyiapkan makan di rumah pada hari sekolah.

Sekolah mencatat kehadiran setiap pagi, sebelum makanan dibagikan. Data ini dipakai untuk menghitung jumlah porsi pada hari itu. Orang tua bisa bertanya kepada wali kelas jika ada yang berbeda.
`;

const poor = `# Judul

Ini satu kalimat panjang sekali tanpa jeda yang menjelaskan program secara umum dan tidak sekali menyebut fokus kata kunci yang diminta.

## Sub

Kalimat kedua singkat.
`;

/** The same 16 checks, on English prose, where the Flesch band is reachable and all 16 pass. */
const compliantEn = `## How the School Lunch Program Works

The school lunch program provides a hot meal to every child at a participating school on each day of the school term. The kitchen sits inside the school grounds, so a teacher can collect a tray during the lunch break without leaving the building. Each school writes its own menu and sends the number of meals served to the district office at the end of the day.

Parents never pay for the meal, and they never need to visit a separate office to arrange it. The school sends one list at the start of the year, and every child who appears on that list eats for free from the first Monday. A child who is unwell on a particular morning is marked absent instead, and the kitchen simply cooks a smaller number of portions that day.

## Who Runs the Kitchen Each Morning

The kitchen opens well before the first bell rings, which means the food arrives at the tables while it is still hot. Every portion is weighed and counted before it is packed onto a tray, and that count becomes the daily record. One cook and a single helper are enough to serve a school of several hundred children without any delay at the break.

Menus are planned a week in advance and are changed often enough that children do not grow tired of the same dish. Vegetables and fresh fruit appear on the table every single day, and sugar is used sparingly in almost every recipe that the cooks prepare. Whatever food remains when the break ends goes straight back to the kitchen and is thrown away.

## How a New School Joins

A school applies to the district office during the first month of the school year. Inspectors visit the building and check the kitchen, the tables, and the cold storage before the first meal is served. A school that fails this inspection is offered practical help and is then invited to return for a second look.

The district pays for the ingredients and for the kitchen staff, so the school itself carries very little of the cost. An extra **30%** of the budget may come from school funds, and every school reports its spending to the district at the end of each month. This keeps the price of a meal visible to any parent who asks about it during a meeting.

## What Parents Should Know

Parents only need to inform the teacher when a child is unwell or away for the day. They never need to prepare food from home, and they never need to buy a ticket or pay a small fee. Any question about a meal is directed to the class teacher, who then checks with the kitchen team the same day.

The school also keeps a written record of every serving day, and that record is available to any parent who wants to inspect it. If a meal is ever late, the teacher tells the kitchen manager and the kitchen adjusts its timing for the following day.
`;

describe('scoreDraft', () => {
  it('scores a compliant draft above the target', () => {
    const score = scoreDraft(compliant, metadata, 'makan bergizi gratis', 900, 'id', 85);
    expect(score.total).toBe(100);
    expect(score.passed).toBe(true);
    expect(score.failed).toHaveLength(0);
  });

  it('scores a poor draft below the target and names why', () => {
    const score = scoreDraft(poor, metadata, 'makan bergizi gratis', 900, 'id', 85);
    expect(score.passed).toBe(false);
    expect(score.total).toBeLessThan(85);
    expect(score.failed.map((c) => c.id)).toContain('keyphrase_in_p1');
    expect(score.failed.map((c) => c.id)).toContain('no_h1_in_body');
    expect(score.failed.map((c) => c.id)).toContain('word_count_band');
  });

  it('reports a measured Flesch value, never a constant', () => {
    const score = scoreDraft(compliantEn, englishMetadata, 'school lunch', 500, 'en', 85);
    expect(Number.isFinite(score.flesch)).toBe(true);
    expect(score.flesch).not.toBe(0);
    const other = scoreDraft(poor, metadata, 'makan bergizi gratis', 900, 'id', 85);
    expect(other.flesch).not.toBe(score.flesch);
  });

  it('counts exactly 16 checks', () => {
    const score = scoreDraft(compliant, metadata, 'makan bergizi gratis', 900, 'id', 85);
    expect(score.checks).toHaveLength(16);
    expect(score.checks.map((c) => c.id)).toContain('flesch_range');
    expect(score.checks.map((c) => c.id)).toContain('word_count_band');
  });

  it('derives total from passed over scored', () => {
    const score = scoreDraft(compliant, metadata, 'makan bergizi gratis', 900, 'id', 85);
    const scored = score.checks.filter((c) => !c.unavailable);
    const passed = scored.filter((c) => c.passed).length;
    expect(score.total).toBe(Math.round((passed / scored.length) * 100));
  });

  it('accepts a word count inside the ±20% band and rejects one outside', () => {
    const inBand = scoreDraft(compliant, metadata, 'makan bergizi gratis', 900, 'id', 85);
    expect(inBand.checks.find((c) => c.id === 'word_count_band')?.passed).toBe(true);
    const outOfBand = scoreDraft(poor, metadata, 'makan bergizi gratis', 900, 'id', 85);
    expect(outOfBand.checks.find((c) => c.id === 'word_count_band')?.passed).toBe(false);
  });

  it('returns a failing score instead of throwing on an empty draft', () => {
    const score = scoreDraft('', metadata, 'makan bergizi gratis', 900, 'id', 85);
    expect(score.passed).toBe(false);
    expect(score.flesch).toBe(0);
  });

  it('respects a lower target', () => {
    expect(scoreDraft(poor, metadata, 'makan bergizi gratis', 900, 'id', 5).passed).toBe(true);
  });

  it('reaches 16 of 16 on a draft that satisfies every check', () => {
    const score = scoreDraft(compliantEn, englishMetadata, 'school lunch', 500, 'en', 85);
    expect(score.total).toBe(100);
    expect(score.failed).toHaveLength(0);
    expect(score.checks.filter((c) => c.unavailable)).toHaveLength(0);
  });

  it('withholds an unreachable Flesch band from the score but still reports it', () => {
    const score = scoreDraft(compliant, metadata, 'makan bergizi gratis', 900, 'id', 85);
    const band = score.checks.find((c) => c.id === 'flesch_range');
    expect(band?.unavailable).toBe(true);
    expect(band?.passed).toBe(false);
    expect(band?.actual).toBe(String(score.flesch));
    expect(band?.expected).toBe('60-70 is unreachable for this corpus; maximum possible is 14.2');
    expect(score.checks.filter((c) => c.unavailable)).toHaveLength(1);
    expect(score.checks.filter((c) => !c.unavailable)).toHaveLength(15);
    expect(score.failed.map((c) => c.id)).not.toContain('flesch_range');
  });

  it('scores the Flesch band normally when the corpus can reach it', () => {
    const score = scoreDraft(compliantEn, englishMetadata, 'school lunch', 500, 'en', 85);
    const band = score.checks.find((c) => c.id === 'flesch_range');
    expect(band?.unavailable).toBeUndefined();
    expect(band?.passed).toBe(true);
    expect(band?.expected).toBe('between 60 and 70');
    expect(band?.actual).toBe(String(score.flesch));
  });

  it('keeps an empty draft failing the Flesch band instead of excusing it', () => {
    const score = scoreDraft('', metadata, 'makan bergizi gratis', 900, 'id', 85);
    const band = score.checks.find((c) => c.id === 'flesch_range');
    expect(band?.unavailable).toBeUndefined();
    expect(band?.passed).toBe(false);
    expect(score.failed.map((c) => c.id)).toContain('flesch_range');
  });
});

describe('formatFailedChecks', () => {
  it('lists only the failures with a fixed header', () => {
    const score = scoreDraft(poor, metadata, 'makan bergizi gratis', 900, 'id', 85);
    const text = formatFailedChecks(score);
    expect(text).toContain('These measured checks failed');
    expect(text).toContain('Fix each one');
    for (const check of score.failed) expect(text).toContain(check.id);
    for (const check of score.checks.filter((c) => c.passed)) {
      expect(text).not.toContain(`${check.id}: `);
    }
  });

  it('never asks the writer to fix a check the corpus cannot satisfy', () => {
    const score = scoreDraft(poor, metadata, 'makan bergizi gratis', 900, 'id', 85);
    expect(score.checks.find((c) => c.id === 'flesch_range')?.unavailable).toBe(true);
    expect(formatFailedChecks(score)).not.toContain('flesch_range');
  });

  it('returns an empty string when nothing failed', () => {
    const score = scoreDraft(compliant, metadata, 'makan bergizi gratis', 900, 'id', 85);
    expect(score.failed).toHaveLength(0);
    expect(formatFailedChecks(score)).toBe('');
  });
});