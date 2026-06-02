CREATE TABLE IF NOT EXISTS yozuvlar (
  id              SERIAL PRIMARY KEY,
  tur             VARCHAR(20) NOT NULL CHECK (tur IN ('spisaniya','vozvrat','kafe','ovqatlanish')),
  tovar           VARCHAR(255) NOT NULL,
  miqdor          DECIMAL(10,3) NOT NULL,
  birlik          VARCHAR(20) NOT NULL DEFAULT 'kg',
  summa           DECIMAL(15,2) NOT NULL,
  sabab           VARCHAR(100),
  filial          VARCHAR(100) NOT NULL,
  firma           VARCHAR(255),
  kafe_nomi       VARCHAR(255),
  xodim_ism       VARCHAR(255) NOT NULL,
  xodim_username  VARCHAR(255),
  xodim_id        BIGINT NOT NULL,
  rasm_file_id    VARCHAR(500),
  guruh_message_id BIGINT,
  kategoriya      VARCHAR(100),
  vaqt            TIMESTAMP DEFAULT NOW(),
  status          VARCHAR(30) DEFAULT 'yangi'
);

CREATE TABLE IF NOT EXISTS kategoriyalar (
  id         SERIAL PRIMARY KEY,
  nomi       VARCHAR(100) NOT NULL UNIQUE,
  yaratilgan TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vozvrat_nazorat (
  id              SERIAL PRIMARY KEY,
  yozuv_id        INTEGER REFERENCES yozuvlar(id) ON DELETE CASCADE,
  status          VARCHAR(30) NOT NULL DEFAULT 'kutilmoqda'
                  CHECK (status IN ('kutilmoqda','jarayonda','bajarildi','rad_etildi')),
  firma_javob     TEXT,
  muddat          DATE,
  yangilagan_id   BIGINT,
  yangilagan_ism  VARCHAR(255),
  yangilangan_vaqt TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS filialar (
  id       SERIAL PRIMARY KEY,
  nomi     VARCHAR(100) NOT NULL UNIQUE,
  aktiv    BOOLEAN DEFAULT true,
  topic_id BIGINT
);

CREATE TABLE IF NOT EXISTS sozlamalar (
  kalit      TEXT PRIMARY KEY,
  qiymat     TEXT NOT NULL,
  yangilangan TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO filialar (nomi) VALUES
  ('MegaCenter'), ('SmartCity'), ('Oila SM'), ('GoldMart')
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_yozuvlar_vaqt ON yozuvlar(vaqt DESC);
CREATE INDEX IF NOT EXISTS idx_yozuvlar_tur ON yozuvlar(tur);
CREATE INDEX IF NOT EXISTS idx_yozuvlar_kategoriya ON yozuvlar(kategoriya);
CREATE INDEX IF NOT EXISTS idx_vozvrat_status ON vozvrat_nazorat(status);
