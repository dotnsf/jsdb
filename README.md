# JSDB - JavaScript SQL Database

ブラウザで動作する軽量 SQL データベースライブラリ

## 📋 概要

JSDB は、ブラウザ上で SQL を使ってデータを管理できる軽量ライブラリです。IndexedDB を使用してデータを永続化するため、ページをリロードしてもデータが保持されます。

## ✨ 特徴

- 🚀 **シンプルな API** - `new JSDB("dbname")` と `db.execute(SQL)` だけで使える
- 💾 **データ永続化** - IndexedDB を使用してブラウザにデータを保存
- 📝 **SQL サポート** - CREATE TABLE, DROP TABLE, SELECT, INSERT, UPDATE, DELETE
- 🔍 **WHERE 句** - 比較演算子（=, !=, >, <, >=, <=）と論理演算子（AND, OR）
- 📊 **ORDER BY & LIMIT** - ソート、ページネーション、複数カラムソート対応
- 📈 **集約関数** - COUNT, SUM, AVG, MIN, MAX をサポート
- 🔢 **GROUP BY & HAVING** - データのグループ化とグループフィルタリング
- 🏷️ **カラムエイリアス** - AS 句でカラム名や集約関数の結果に別名を付与
- 🔑 **PRIMARY KEY 制約** - NULL 禁止と一意性制約をサポート
- 🚫 **NOT NULL 制約** - NULL 値の挿入を禁止
- 🔒 **UNIQUE 制約** - 重複値の挿入を禁止（NULL は複数許可）
- 🛡️ **IF EXISTS / IF NOT EXISTS** - テーブル作成・削除時の安全なチェック
- 🎯 **型サポート** - INTEGER, TEXT, REAL, BLOB, DATE, DATETIME
- 🔐 **プレースホルダー** - 位置指定 (`?`) と名前付き (`:name`) をサポート
- 📦 **バイナリデータ** - ArrayBuffer, Uint8Array, Blob オブジェクトを保存可能
- ⚡ **軽量** - 単一ファイル、依存関係なし

## 🚀 クイックスタート

### インストール

```html
<script src="jsdb.js"></script>
```

```html(CDN)
<script src="https://dotnsf.github.io/jsdb/jsdb.js"></script>
```

### 基本的な使い方

```javascript
// データベースを作成
const db = new JSDB("mydb");

// テーブルを作成
await db.execute("CREATE TABLE users (id INTEGER, name TEXT, age INTEGER)");

// データを挿入
await db.execute("INSERT INTO users (id, name, age) VALUES (1, 'Alice', 25)");
await db.execute("INSERT INTO users (id, name, age) VALUES (2, 'Bob', 30)");

// データを取得
const result = await db.execute("SELECT * FROM users WHERE age > 20");
console.log(result.rows);
// [{ id: 1, name: 'Alice', age: 25 }, { id: 2, name: 'Bob', age: 30 }]

// データを更新
await db.execute("UPDATE users SET age = 26 WHERE name = 'Alice'");

// データを削除
await db.execute("DELETE FROM users WHERE id = 1");
```

## 📚 API リファレンス

### JSDB クラス

#### `new JSDB(dbName)`

データベースインスタンスを作成します。

**パラメータ:**
- `dbName` (string) - データベース名

**例:**
```javascript
const db = new JSDB("mydb");
```

#### `db.execute(sql, params)`

SQL 文を実行します。プレースホルダーを使用してパラメータをバインドできます。

**パラメータ:**
- `sql` (string) - 実行する SQL 文
- `params` (Array|Object) - プレースホルダーのパラメータ（オプション）
  - 配列: 位置指定プレースホルダー (`?`) 用
  - オブジェクト: 名前付きプレースホルダー (`:name`) 用

**戻り値:**
- Promise<Object> - 実行結果

**例:**
```javascript
// プレースホルダーなし
const result = await db.execute("SELECT * FROM users");
console.log(result.rows);

// 位置指定プレースホルダー
await db.execute("INSERT INTO users (id, name) VALUES (?, ?)", [1, 'Alice']);

// 名前付きプレースホルダー
await db.execute("SELECT * FROM users WHERE name = :name", { name: 'Alice' });
```

#### `db.close()`

データベース接続を閉じます。

**例:**
```javascript
db.close();
```

#### `db.listTables()`

データベース内の全テーブル名を取得します。

**戻り値:**
- Promise<string[]> - テーブル名の配列

**例:**
```javascript
const tables = await db.listTables();
console.log(tables); // ['users', 'products', 'orders']
```

#### `db.describeTable(tableName)`

テーブルの詳細情報（カラム定義とPRIMARY KEY情報）を取得します。

**パラメータ:**
- `tableName` (string) - テーブル名

**戻り値:**
- Promise<Object> - テーブル情報
  - `tableName` (string) - テーブル名
  - `columns` (Array) - カラム定義の配列
    - `name` (string) - カラム名
    - `type` (string) - データ型
  - `primaryKey` (string|null) - PRIMARY KEYカラム名（なければnull）

**例:**
```javascript
const tableInfo = await db.describeTable('users');
console.log(tableInfo);
// {
//   tableName: 'users',
//   columns: [
//     { name: 'id', type: 'INTEGER' },
//     { name: 'name', type: 'TEXT' },
//     { name: 'email', type: 'TEXT' }
//   ],
//   primaryKey: 'id'
// }
```


#### `JSDB.listDatabases()` (静的メソッド)

作成済みのデータベース一覧を取得します。

**戻り値:**
- Promise<string[]> - データベース名の配列

**例:**
```javascript
const databases = await JSDB.listDatabases();
console.log(databases); // ['mydb', 'testdb', 'userdb']
```

**注意:**
- この機能は Chrome/Edge でのみサポートされています
- Firefox や Safari では使用できません


#### `JSDB.deleteDatabase(dbName)` (静的メソッド)

データベースを削除します。

**パラメータ:**
- `dbName` (string) - 削除するデータベース名

**例:**
```javascript
await JSDB.deleteDatabase("mydb");
```

## 📖 SQL 構文

### CREATE TABLE

テーブルを作成します。

```sql
CREATE TABLE table_name (
    column1 INTEGER,
    column2 TEXT,
    column3 REAL
)
```

**IF NOT EXISTS オプション:**

`IF NOT EXISTS` を使用すると、テーブルが既に存在する場合にエラーを発生させずにスキップします。

```sql
CREATE TABLE IF NOT EXISTS table_name (
    column1 INTEGER,
    column2 TEXT,
    column3 REAL
)
```

**サポートされるデータ型:**
- `INTEGER` - 整数
- `TEXT` - 文字列
- `REAL` - 浮動小数点数
- `BLOB` - バイナリデータ（ArrayBuffer, Uint8Array, Blob）
- `DATE` - 日付
- `DATETIME` - 日時

**PRIMARY KEY 制約:**

カラムに PRIMARY KEY 制約を設定できます。PRIMARY KEY には以下の制約があります：
- NULL 値を許可しません
- 重複する値を許可しません（一意性制約）
- テーブルごとに1つのカラムのみ設定可能

```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name TEXT,
    email TEXT
)
```

**例:**
```javascript
// 基本的なテーブル作成
await db.execute("CREATE TABLE products (id INTEGER, name TEXT, price REAL)");

// IF NOT EXISTS を使用したテーブル作成
await db.execute("CREATE TABLE IF NOT EXISTS products (id INTEGER, name TEXT, price REAL)");
// テーブルが既に存在する場合はエラーにならずスキップされます

// PRIMARY KEY 制約付きテーブル作成
await db.execute(`
    CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        name TEXT,
        email TEXT
    )
`);

// IF NOT EXISTS と PRIMARY KEY の組み合わせ
await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        name TEXT,
        email TEXT
    )
`);

// PRIMARY KEY 制約の動作確認
await db.execute("INSERT INTO users (id, name, email) VALUES (1, 'Alice', 'alice@example.com')");

// エラー: NULL 値は許可されません
// await db.execute("INSERT INTO users (id, name, email) VALUES (NULL, 'Bob', 'bob@example.com')");

// エラー: 重複する値は許可されません
// await db.execute("INSERT INTO users (id, name, email) VALUES (1, 'Charlie', 'charlie@example.com')");
```

**NOT NULL 制約:**

カラムに NOT NULL 制約を設定できます。NOT NULL 制約は NULL 値の挿入を禁止します。

```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT
)
```

**例:**
```javascript
// NOT NULL 制約付きテーブル作成
await db.execute(`
    CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT
    )
`);

// 正常なデータ挿入
await db.execute("INSERT INTO users (id, name, email) VALUES (1, 'Alice', 'alice@example.com')");

// エラー: NOT NULL 制約違反
// await db.execute("INSERT INTO users (id, name, email) VALUES (2, NULL, 'bob@example.com')");
```

**UNIQUE 制約:**

カラムに UNIQUE 制約を設定できます。UNIQUE 制約は重複する値の挿入を禁止します（NULL 値は複数許可されます）。

```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name TEXT,
    email TEXT UNIQUE
)
```

**例:**
```javascript
// UNIQUE 制約付きテーブル作成
await db.execute(`
    CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        name TEXT,
        email TEXT UNIQUE
    )
`);

// 正常なデータ挿入
await db.execute("INSERT INTO users (id, name, email) VALUES (1, 'Alice', 'alice@example.com')");
await db.execute("INSERT INTO users (id, name, email) VALUES (2, 'Bob', 'bob@example.com')");

// エラー: UNIQUE 制約違反（重複するemail）
// await db.execute("INSERT INTO users (id, name, email) VALUES (3, 'Charlie', 'alice@example.com')");

// NULL 値は複数許可される
await db.execute("INSERT INTO users (id, name, email) VALUES (4, 'Dave', NULL)");
await db.execute("INSERT INTO users (id, name, email) VALUES (5, 'Eve', NULL)");
```

**DEFAULT 制約:**

カラムに DEFAULT 制約を設定できます。DEFAULT 制約は、INSERT時に値が指定されなかった場合に自動的に設定される値を定義します。

```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

**サポートされるDEFAULT値:**
- リテラル値（文字列、数値、NULL）
- `CURRENT_TIMESTAMP` - 現在の日時
- `CURRENT_DATE` - 現在の日付
- `CURRENT_TIME` - 現在の時刻

**例:**
```javascript
// DEFAULT 制約付きテーブル作成
await db.execute(`
    CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

// statusとcreated_atは自動的に設定される
await db.execute("INSERT INTO users (id, name) VALUES (1, 'Alice')");

// 明示的に値を指定することも可能
await db.execute("INSERT INTO users (id, name, status) VALUES (2, 'Bob', 'inactive')");
```

**制約の組み合わせ:**

PRIMARY KEY、NOT NULL、UNIQUE、DEFAULT 制約は組み合わせて使用できます。

```sql
CREATE TABLE accounts (
    id INTEGER PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE,
    status TEXT DEFAULT 'active' NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

### DROP TABLE

テーブルを削除します。テーブルとそのデータが完全に削除されます。

```sql
DROP TABLE table_name
```

**IF EXISTS オプション:**

`IF EXISTS` を使用すると、テーブルが存在しない場合にエラーを発生させずにスキップします。

```sql
DROP TABLE IF EXISTS table_name
```

**例:**
```javascript
// 基本的なテーブル削除
await db.execute("DROP TABLE products");

// IF EXISTS を使用したテーブル削除
await db.execute("DROP TABLE IF EXISTS products");
// テーブルが存在しない場合はエラーにならずスキップされます

// テーブルが存在しない場合のエラー
try {
    await db.execute("DROP TABLE non_existent_table");
} catch (error) {
    console.error("エラー:", error.message);
    // エラー: Table 'non_existent_table' does not exist
}

// IF EXISTS を使えばエラーにならない
await db.execute("DROP TABLE IF EXISTS non_existent_table");
// エラーなし
```

**注意事項:**
- DROP TABLE を実行すると、テーブルとそのすべてのデータが完全に削除されます
- 削除されたデータは復元できません
- 削除後に同じ名前でテーブルを再作成すると、空のテーブルが作成されます


### INSERT

データを挿入します。

```sql
INSERT INTO table_name (column1, column2) VALUES (value1, value2)
```

**例:**
```javascript
await db.execute("INSERT INTO products (id, name, price) VALUES (1, 'Apple', 1.5)");
```

### SELECT

データを取得します。

```sql
SELECT * FROM table_name
SELECT column1, column2 FROM table_name WHERE condition
SELECT * FROM table_name ORDER BY column1 ASC, column2 DESC
SELECT * FROM table_name LIMIT 10 OFFSET 5
```

**例:**
```javascript
// 全データ取得
const result = await db.execute("SELECT * FROM products");

// 特定のカラムのみ取得
const result = await db.execute("SELECT name, price FROM products");

// WHERE 句で絞り込み
const result = await db.execute("SELECT * FROM products WHERE price > 1.0");

// AND/OR 条件
const result = await db.execute("SELECT * FROM products WHERE price > 1.0 AND price < 2.0");
const result = await db.execute("SELECT * FROM products WHERE name = 'Apple' OR price < 1.0");

// ORDER BY でソート
const result = await db.execute("SELECT * FROM products ORDER BY price ASC");
const result = await db.execute("SELECT * FROM products ORDER BY price DESC");

// 複数カラムでソート
const result = await db.execute("SELECT * FROM products ORDER BY category ASC, price DESC");

// LIMIT でページネーション
const result = await db.execute("SELECT * FROM products LIMIT 10");
const result = await db.execute("SELECT * FROM products LIMIT 10 OFFSET 20");

// WHERE, ORDER BY, LIMIT の組み合わせ
const result = await db.execute("SELECT * FROM products WHERE price > 10 ORDER BY price DESC LIMIT 5");

// カラムエイリアス（AS句）
const result = await db.execute("SELECT name AS product_name, price AS product_price FROM products");
const result = await db.execute("SELECT COUNT(*) AS total FROM products");
const result = await db.execute("SELECT category, SUM(price) AS total_price FROM products GROUP BY category");
```

**カラムエイリアス（AS句）:**

SELECT句でカラムや集約関数の結果に別名（エイリアス）を付けることができます。

```sql
SELECT column_name AS alias_name FROM table_name
SELECT COUNT(*) AS count FROM table_name
SELECT column1, SUM(column2) AS total FROM table_name GROUP BY column1
```

- 通常のカラムにエイリアスを付与
- 集約関数の結果にエイリアスを付与
- SQLキーワード（COUNT, SUM など）もエイリアス名として使用可能
- エイリアスは結果のカラム名として返される

**例:**
```javascript
// 通常のカラムにエイリアス
const result = await db.execute("SELECT name AS product_name, price AS unit_price FROM products");
console.log(result.rows[0].product_name); // エイリアスでアクセス

// 集約関数にエイリアス
const result = await db.execute("SELECT COUNT(*) AS total, AVG(price) AS average FROM products");
console.log(result.rows[0].total);    // 件数
console.log(result.rows[0].average);  // 平均価格

// GROUP BY と組み合わせ
const result = await db.execute(`
    SELECT category,
           COUNT(*) AS count,
           SUM(price) AS total
    FROM products
    GROUP BY category
`);
```

### UPDATE

データを更新します。

```sql
UPDATE table_name SET column1 = value1 WHERE condition
UPDATE table_name SET column1 = value1, column2 = value2 WHERE condition
```

**例:**
```javascript
await db.execute("UPDATE products SET price = 1.8 WHERE name = 'Apple'");
await db.execute("UPDATE products SET name = 'Red Apple', price = 2.0 WHERE id = 1");
```

### DELETE

データを削除します。

```sql
DELETE FROM table_name WHERE condition
```

**例:**
```javascript
await db.execute("DELETE FROM products WHERE price < 1.0");
await db.execute("DELETE FROM products WHERE name = 'Apple'");
```

### ALTER TABLE

テーブルの構造を変更します。

#### ALTER TABLE ADD COLUMN

既存のテーブルに新しいカラムを追加します。

```sql
ALTER TABLE table_name ADD COLUMN column_name data_type [constraints]
```

**サポートされる制約:**
- `PRIMARY KEY` - 主キー制約（テーブルに既にPRIMARY KEYがある場合はエラー）
- `NOT NULL` - NULL値を禁止（既存データがある場合はDEFAULT値が必要）
- `UNIQUE` - 一意性制約
- `DEFAULT value` - デフォルト値（リテラル値、CURRENT_TIMESTAMP、CURRENT_DATE、CURRENT_TIME）

**例:**
```javascript
// 基本的なカラム追加
await db.execute("ALTER TABLE users ADD COLUMN age INTEGER");

// DEFAULT値付きカラム追加
await db.execute("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'");

// NOT NULL + DEFAULT制約
await db.execute("ALTER TABLE users ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL");

// UNIQUE制約付きカラム追加
await db.execute("ALTER TABLE users ADD COLUMN email TEXT UNIQUE");

// 複数の制約を組み合わせ
await db.execute("ALTER TABLE users ADD COLUMN username TEXT UNIQUE NOT NULL DEFAULT 'user'");
```

**注意事項:**
- 既存のテーブルにデータがある場合、新しいカラムには NULL またはDEFAULT値が設定されます
- NOT NULL制約を持つカラムを追加する場合、既存データがあればDEFAULT値が必須です
- PRIMARY KEY制約を持つカラムは、テーブルに既にPRIMARY KEYがない場合のみ追加できます

#### ALTER TABLE DROP COLUMN

既存のテーブルからカラムを削除します。

```sql
ALTER TABLE table_name DROP COLUMN column_name
```

**例:**
```javascript
// 基本的なカラム削除
await db.execute("ALTER TABLE users DROP COLUMN age");

// 複数カラムの削除（個別に実行）
await db.execute("ALTER TABLE users DROP COLUMN email");
await db.execute("ALTER TABLE users DROP COLUMN phone");
```

**制限事項:**
- PRIMARY KEYカラムは削除できません
- テーブルの最後のカラムは削除できません（テーブルには最低1つのカラムが必要）
- 削除されたカラムのデータは復元できません

**注意事項:**
- カラムを削除すると、そのカラムのすべてのデータが完全に削除されます
- 削除後に同じ名前でカラムを再追加すると、空のカラムが作成されます

## 🔍 WHERE 句

### 比較演算子

- `=` - 等しい
- `!=` - 等しくない
- `>` - より大きい
- `<` - より小さい
- `>=` - 以上
- `<=` - 以下

### 論理演算子

- `AND` - かつ
- `OR` - または

**例:**
```javascript
// 単純な比較

## 🔐 プレースホルダー

SQL インジェクション攻撃を防ぎ、安全にパラメータを渡すためにプレースホルダーを使用できます。

### 位置指定プレースホルダー (`?`)

配列でパラメータを渡します。プレースホルダーは出現順に置き換えられます。

**例:**
```javascript
// INSERT
await db.execute(
    "INSERT INTO users (id, name, age) VALUES (?, ?, ?)",
    [1, 'Alice', 25]
);

// SELECT
const result = await db.execute(
    "SELECT * FROM users WHERE age > ? AND age < ?",
    [20, 30]
);

// UPDATE
await db.execute(
    "UPDATE users SET age = ? WHERE name = ?",
    [26, 'Alice']
);

// DELETE
await db.execute(
    "DELETE FROM users WHERE id = ?",
    [1]
);

// LIKE
const result = await db.execute(
    "SELECT * FROM users WHERE email LIKE ?",
    ['%@example.com']
);
```

### 名前付きプレースホルダー (`:name`)

オブジェクトでパラメータを渡します。プレースホルダー名とオブジェクトのキーが対応します。

**例:**
```javascript
// INSERT
await db.execute(
    "INSERT INTO users (id, name, age) VALUES (:id, :name, :age)",
    { id: 1, name: 'Alice', age: 25 }
);

// SELECT
const result = await db.execute(
    "SELECT * FROM users WHERE age > :minAge AND age < :maxAge",
    { minAge: 20, maxAge: 30 }
);

// UPDATE
await db.execute(
    "UPDATE users SET age = :age WHERE name = :name",
    { age: 26, name: 'Alice' }
);

// DELETE
await db.execute(
    "DELETE FROM users WHERE id = :id",
    { id: 1 }
);

// LIKE
const result = await db.execute(
    "SELECT * FROM users WHERE email LIKE :pattern",
    { pattern: '%@example.com' }
);
```


## 📦 BLOB 型（バイナリデータ）

BLOB 型を使用して、画像、PDF、その他のバイナリデータを保存できます。

### サポートされる形式

- **ArrayBuffer** - 生のバイナリデータ
- **Uint8Array** - 型付き配列
- **Blob** - Blob オブジェクト

### 使用例

```javascript
// テーブル作成
await db.execute("CREATE TABLE files (id INTEGER, name TEXT, data BLOB, size INTEGER)");

// ArrayBuffer を保存
const buffer = new ArrayBuffer(100);
const view = new Uint8Array(buffer);
for (let i = 0; i < 100; i++) {
    view[i] = i;
}
await db.execute(
    "INSERT INTO files (id, name, data, size) VALUES (?, ?, ?, ?)",
    [1, 'data.bin', buffer, buffer.byteLength]
);

// Uint8Array を保存
const uint8 = new Uint8Array([1, 2, 3, 4, 5]);
await db.execute(
    "INSERT INTO files (id, name, data, size) VALUES (?, ?, ?, ?)",
    [2, 'numbers.bin', uint8, uint8.length]
);

// Blob オブジェクトを保存
const blob = new Blob([new Uint8Array([65, 66, 67])], { type: 'text/plain' });
await db.execute(
    "INSERT INTO files (id, name, data, size) VALUES (?, ?, ?, ?)",
    [3, 'text.txt', blob, 3]
);

// データを取得（ArrayBuffer として返される）
const result = await db.execute("SELECT * FROM files WHERE id = 1");
const retrievedBuffer = result.rows[0].data; // ArrayBuffer

// ArrayBuffer を Uint8Array に変換
const retrievedView = new Uint8Array(retrievedBuffer);
console.log(retrievedView[0]); // 0

// ArrayBuffer を Blob に変換
const retrievedBlob = new Blob([retrievedBuffer], { type: 'application/octet-stream' });
```

### 画像の保存と表示

```javascript
// ファイル入力から画像を取得
const fileInput = document.getElementById('fileInput');
fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    const arrayBuffer = await file.arrayBuffer();
    
    // データベースに保存
    await db.execute(
        "INSERT INTO files (id, name, data, size) VALUES (?, ?, ?, ?)",
        [1, file.name, arrayBuffer, arrayBuffer.byteLength]
    );
});

// データベースから画像を取得して表示
const result = await db.execute("SELECT * FROM files WHERE id = 1");
const imageData = result.rows[0].data;
const blob = new Blob([imageData], { type: 'image/png' });
const url = URL.createObjectURL(blob);
document.getElementById('image').src = url;
```

### 注意事項

- BLOB データは常に **ArrayBuffer** として返されます
- 必要に応じて Uint8Array や Blob に変換してください
- 大きなファイル（数MB以上）を保存する場合は、ブラウザのストレージ制限に注意してください

### プレースホルダーの利点

- **セキュリティ**: SQL インジェクション攻撃を防ぐ
- **可読性**: 名前付きプレースホルダーでコードが読みやすくなる
- **再利用性**: 同じ SQL 文を異なるパラメータで実行しやすい
- **型安全**: パラメータの型変換が自動的に行われる

await db.execute("SELECT * FROM users WHERE age = 25");

// 範囲指定
await db.execute("SELECT * FROM users WHERE age >= 20 AND age <= 30");

// OR 条件
await db.execute("SELECT * FROM users WHERE name = 'Alice' OR name = 'Bob'");

// 複合条件
await db.execute("SELECT * FROM users WHERE (age > 20 AND age < 30) OR name = 'Charlie'");
```

## 📊 ORDER BY と LIMIT

### ORDER BY - ソート

結果を指定したカラムでソートします。

**構文:**
```sql
SELECT * FROM table_name ORDER BY column1 [ASC|DESC]
SELECT * FROM table_name ORDER BY column1 [ASC|DESC], column2 [ASC|DESC]
```

**ソート順:**
- `ASC` - 昇順（デフォルト）
- `DESC` - 降順

**例:**
```javascript
// 昇順ソート（デフォルト）
const result = await db.execute("SELECT * FROM users ORDER BY age");
const result = await db.execute("SELECT * FROM users ORDER BY age ASC");

// 降順ソート
const result = await db.execute("SELECT * FROM users ORDER BY age DESC");

// 複数カラムでソート
const result = await db.execute("SELECT * FROM users ORDER BY age ASC, name DESC");

// 文字列カラムでソート
const result = await db.execute("SELECT * FROM users ORDER BY name ASC");

// WHERE 句と組み合わせ
const result = await db.execute("SELECT * FROM users WHERE age > 20 ORDER BY age DESC");
```

### LIMIT - ページネーション

取得する行数を制限します。OFFSET と組み合わせてページネーションを実装できます。

**構文:**
```sql
SELECT * FROM table_name LIMIT count
SELECT * FROM table_name LIMIT count OFFSET skip
```

**パラメータ:**
- `count` - 取得する最大行数
- `skip` - スキップする行数（オプション）

**例:**
```javascript
// 最初の10件を取得
const result = await db.execute("SELECT * FROM users LIMIT 10");

// 11件目から10件を取得（ページネーション）
const result = await db.execute("SELECT * FROM users LIMIT 10 OFFSET 10");

// ORDER BY と組み合わせ
const result = await db.execute("SELECT * FROM users ORDER BY age DESC LIMIT 5");

// WHERE, ORDER BY, LIMIT の組み合わせ
const result = await db.execute(
    "SELECT * FROM users WHERE age > 20 ORDER BY age ASC LIMIT 10 OFFSET 5"
);

// ページネーションの実装例
const pageSize = 10;
const pageNumber = 2; // 2ページ目
const offset = (pageNumber - 1) * pageSize;
const result = await db.execute(
    `SELECT * FROM users ORDER BY id ASC LIMIT ${pageSize} OFFSET ${offset}`
);
```

### 実用例

**トップ N の取得:**
```javascript
// スコア上位5人を取得
const result = await db.execute(
    "SELECT * FROM users ORDER BY score DESC LIMIT 5"
);
```

**ページネーション:**
```javascript
async function getPage(pageNumber, pageSize = 10) {
    const offset = (pageNumber - 1) * pageSize;
    return await db.execute(
        `SELECT * FROM users ORDER BY id ASC LIMIT ${pageSize} OFFSET ${offset}`
    );
}

// 1ページ目
const page1 = await getPage(1);
// 2ページ目
const page2 = await getPage(2);
```

**複雑なソート:**
```javascript
// 年齢の昇順、同じ年齢の場合は名前の降順
const result = await db.execute(
    "SELECT * FROM users ORDER BY age ASC, name DESC"
);

## 📈 集約関数

データの集計や統計情報を取得するための集約関数をサポートしています。

### サポートされる集約関数

- **COUNT(*)** - 全行数をカウント
- **COUNT(column)** - NULL を除く行数をカウント
- **SUM(column)** - 数値カラムの合計
- **AVG(column)** - 数値カラムの平均
- **MIN(column)** - 最小値
- **MAX(column)** - 最大値

### 基本的な使い方

```javascript
// 全行数を取得
const result = await db.execute("SELECT COUNT(*) FROM users");
console.log(result.rows[0]['COUNT(*)']); // 例: 100

// NULL を除く行数
const result = await db.execute("SELECT COUNT(age) FROM users");

// 合計
const result = await db.execute("SELECT SUM(score) FROM users");
console.log(result.rows[0]['SUM(score)']); // 例: 8500

// 平均
const result = await db.execute("SELECT AVG(age) FROM users");
console.log(result.rows[0]['AVG(age)']); // 例: 28.5

// 最小値
const result = await db.execute("SELECT MIN(price) FROM products");
console.log(result.rows[0]['MIN(price)']); // 例: 9.99

// 最大値
const result = await db.execute("SELECT MAX(price) FROM products");
console.log(result.rows[0]['MAX(price)']); // 例: 999.99
```

### WHERE 句との組み合わせ

```javascript
// 条件付きカウント
const result = await db.execute(
    "SELECT COUNT(*) FROM users WHERE age >= 20"
);

// 条件付き合計
const result = await db.execute(
    "SELECT SUM(price) FROM products WHERE category = 'Electronics'"
);

// 条件付き平均
const result = await db.execute(
    "SELECT AVG(score) FROM users WHERE score > 50"
);
```

### 複数の集約関数

```javascript
// 複数の集約関数を同時に使用
const result = await db.execute(
    "SELECT COUNT(*), SUM(price), AVG(price), MIN(price), MAX(price) FROM products"
);

console.log(result.rows[0]);
// {
//   'COUNT(*)': 100,
//   'SUM(price)': 12345.67,
//   'AVG(price)': 123.46,
//   'MIN(price)': 9.99,
//   'MAX(price)': 999.99
// }
```

### NULL 値の扱い

```javascript
// COUNT(*) は NULL を含む
const result = await db.execute("SELECT COUNT(*) FROM users");
// すべての行をカウント

// COUNT(column) は NULL を除外
const result = await db.execute("SELECT COUNT(email) FROM users");
// email が NULL でない行のみカウント

// SUM, AVG, MIN, MAX も NULL を無視
const result = await db.execute("SELECT AVG(age) FROM users");
// age が NULL でない行の平均を計算
```

## 🔢 GROUP BY と HAVING

データをグループ化して集約関数を適用し、グループごとの統計情報を取得できます。

### GROUP BY - グループ化

指定したカラムの値でデータをグループ化します。

**構文:**
```sql
SELECT column1, aggregate_function(column2) FROM table_name GROUP BY column1
SELECT column1, column2, aggregate_function(column3) FROM table_name GROUP BY column1, column2
```

**基本的な使い方:**
```javascript
// カテゴリ別の商品数
const result = await db.execute(
    "SELECT category, COUNT(*) FROM products GROUP BY category"
);
// 結果: [
//   { category: 'Electronics', 'COUNT(*)': 50 },
//   { category: 'Furniture', 'COUNT(*)': 30 }
// ]

// カテゴリ別の合計金額
const result = await db.execute(
    "SELECT category, SUM(price) FROM products GROUP BY category"
);

// カテゴリ別の平均価格
const result = await db.execute(
    "SELECT category, AVG(price) FROM products GROUP BY category"
);

// カテゴリ別の最高価格と最低価格
const result = await db.execute(
    "SELECT category, MAX(price), MIN(price) FROM products GROUP BY category"
);
```

### 複数カラムでのグループ化

```javascript
// カテゴリとブランド別の商品数
const result = await db.execute(
    "SELECT category, brand, COUNT(*) FROM products GROUP BY category, brand"
);
```

### WHERE 句との組み合わせ

```javascript
// 価格が100以上の商品をカテゴリ別に集計
const result = await db.execute(
    "SELECT category, COUNT(*), AVG(price) FROM products WHERE price >= 100 GROUP BY category"
);
```

### HAVING - グループのフィルタリング

HAVING 句を使用して、グループ化された結果をフィルタリングできます。WHERE 句が個々の行をフィルタリングするのに対し、HAVING 句はグループ化された結果をフィルタリングします。

**構文:**
```sql
SELECT column1, aggregate_function(column2) FROM table_name 
GROUP BY column1 
HAVING aggregate_function(column2) operator value
```

**基本的な使い方:**
```javascript
// 商品数が10個以上のカテゴリのみ表示
const result = await db.execute(
    "SELECT category, COUNT(*) FROM products GROUP BY category HAVING COUNT(*) >= 10"
);

// 平均価格が100以上のカテゴリのみ表示
const result = await db.execute(
    "SELECT category, AVG(price) FROM products GROUP BY category HAVING AVG(price) >= 100"
);

// 合計売上が10000以上のカテゴリのみ表示
const result = await db.execute(
    "SELECT category, SUM(price * quantity) FROM sales GROUP BY category HAVING SUM(price * quantity) > 10000"
);
```

### ORDER BY と LIMIT との組み合わせ

```javascript
// カテゴリ別の商品数を降順でソートし、上位3件を取得
const result = await db.execute(
    "SELECT category, COUNT(*) FROM products GROUP BY category ORDER BY COUNT(*) DESC LIMIT 3"
);

// 平均価格が高いカテゴリ順に表示
const result = await db.execute(
    "SELECT category, AVG(price) FROM products GROUP BY category ORDER BY AVG(price) DESC"
);
```

### 複数の集約関数を使用

```javascript
// カテゴリ別の統計情報を一度に取得
const result = await db.execute(`
    SELECT 
        category,
        COUNT(*) as count,
        SUM(price) as total,
        AVG(price) as average,
        MIN(price) as min_price,
        MAX(price) as max_price
    FROM products 
    GROUP BY category
`);

console.log(result.rows[0]);
// {
//   category: 'Electronics',
//   'COUNT(*)': 50,
//   'SUM(price)': 25000,
//   'AVG(price)': 500,
//   'MIN(price)': 50,
//   'MAX(price)': 2000
// }
```

### 実用例

**売上レポート:**
```javascript
// 月別の売上統計
const result = await db.execute(`
    SELECT 
        strftime('%Y-%m', sale_date) as month,
        COUNT(*) as sales_count,
        SUM(amount) as total_sales,
        AVG(amount) as avg_sale
    FROM sales 
    GROUP BY strftime('%Y-%m', sale_date)
    ORDER BY month DESC
`);
```

**在庫管理:**
```javascript
// 在庫が少ないカテゴリを特定
const result = await db.execute(`
    SELECT 
        category,
        SUM(stock) as total_stock,
        COUNT(*) as product_count
    FROM products 
    GROUP BY category 
    HAVING SUM(stock) < 100
    ORDER BY total_stock ASC
`);
```

**顧客分析:**
```javascript
// 購入回数が多い顧客を特定
const result = await db.execute(`
    SELECT 
        customer_id,
        COUNT(*) as purchase_count,
        SUM(amount) as total_spent,
        AVG(amount) as avg_purchase
    FROM orders 
    GROUP BY customer_id 
    HAVING COUNT(*) >= 5
    ORDER BY total_spent DESC
    LIMIT 10
`);
```

### WHERE と HAVING の違い

```javascript
// WHERE: グループ化前にフィルタリング（個々の行）
const result = await db.execute(`
    SELECT category, COUNT(*) 
    FROM products 
    WHERE price > 100 
    GROUP BY category
`);
// 価格が100以上の商品のみをカウント

// HAVING: グループ化後にフィルタリング（グループ）
const result = await db.execute(`
    SELECT category, COUNT(*) 
    FROM products 
    GROUP BY category 
    HAVING COUNT(*) > 10
`);
// 商品数が10個以上のカテゴリのみ表示

// 両方を組み合わせる
const result = await db.execute(`
    SELECT category, AVG(price) 
    FROM products 
    WHERE stock > 0 
    GROUP BY category 
    HAVING AVG(price) > 100
`);
// 在庫がある商品の中で、平均価格が100以上のカテゴリのみ表示
```

### 実用例

**統計情報の取得:**
```javascript
// 商品の統計情報
const stats = await db.execute(
    "SELECT COUNT(*) as total, SUM(price) as revenue, AVG(price) as avg_price FROM products"
);
console.log(`Total: ${stats.rows[0].total}`);
console.log(`Revenue: ${stats.rows[0].revenue}`);
console.log(`Average Price: ${stats.rows[0].avg_price}`);
```

**カテゴリ別の集計:**
```javascript
// 特定カテゴリの商品数と平均価格
const result = await db.execute(
    "SELECT COUNT(*), AVG(price) FROM products WHERE category = 'Electronics'"
);
```

**在庫管理:**
```javascript
// 在庫の合計と最小在庫数
const inventory = await db.execute(
    "SELECT SUM(stock) as total_stock, MIN(stock) as min_stock FROM products"
);
```

### 注意事項

- 集約関数は単一の結果行を返します
- 空のテーブルや条件に一致する行がない場合：
  - `COUNT(*)` は `0` を返します
  - `COUNT(column)` は `0` を返します
  - `SUM`, `AVG`, `MIN`, `MAX` は `null` を返します
- 数値型以外のカラムに `SUM` や `AVG` を使用すると、数値として扱えない値は無視されます
```

## 📊 実行結果

### CREATE TABLE の結果

```javascript
{
  type: 'CREATE_TABLE',
  success: true,
  message: "Table 'users' created successfully"
}
```

### INSERT の結果

```javascript
{
  type: 'INSERT',
  success: true,
  insertedId: 1,
  rowCount: 1
}
```

### SELECT の結果

```javascript
{
  type: 'SELECT',
  success: true,
  rows: [
    { id: 1, name: 'Alice', age: 25 },
    { id: 2, name: 'Bob', age: 30 }
  ],
  rowCount: 2
}
```

### UPDATE の結果

```javascript
{
  type: 'UPDATE',
  success: true,
  rowCount: 1
}
```

### DELETE の結果

```javascript
{
  type: 'DELETE',
  success: true,
  rowCount: 1
}
```

## 🎯 使用例

### ユーザー管理システム

```javascript
const db = new JSDB("user_system");

// テーブル作成
await db.execute("CREATE TABLE users (id INTEGER, username TEXT, email TEXT, age INTEGER)");

// ユーザー登録
await db.execute("INSERT INTO users (id, username, email, age) VALUES (1, 'alice', 'alice@example.com', 25)");
await db.execute("INSERT INTO users (id, username, email, age) VALUES (2, 'bob', 'bob@example.com', 30)");

// ユーザー検索
const result = await db.execute("SELECT * FROM users WHERE age >= 25");
console.log(result.rows);

// ユーザー情報更新
await db.execute("UPDATE users SET email = 'newalice@example.com' WHERE username = 'alice'");

// ユーザー削除
await db.execute("DELETE FROM users WHERE id = 2");
```

### 商品管理システム

```javascript
const db = new JSDB("inventory");

// テーブル作成
await db.execute("CREATE TABLE products (id INTEGER, name TEXT, price REAL, stock INTEGER)");

// 商品登録
await db.execute("INSERT INTO products (id, name, price, stock) VALUES (1, 'Laptop', 999.99, 10)");
await db.execute("INSERT INTO products (id, name, price, stock) VALUES (2, 'Mouse', 29.99, 50)");
await db.execute("INSERT INTO products (id, name, price, stock) VALUES (3, 'Keyboard', 79.99, 30)");

// 在庫確認
const result = await db.execute("SELECT * FROM products WHERE stock > 0");
console.log(result.rows);

// 価格更新
await db.execute("UPDATE products SET price = 899.99 WHERE name = 'Laptop'");

// 在庫切れ商品削除
await db.execute("DELETE FROM products WHERE stock = 0");
```

## ⚠️ 制限事項

現在のバージョンでは以下の機能は未サポートです：

- JOIN 操作
- サブクエリ
- インデックス
- トランザクション（自動コミット）
- FOREIGN KEY 制約
- 複合 PRIMARY KEY（複数カラムの PRIMARY KEY）

## 🌐 ブラウザ互換性

IndexedDB をサポートするモダンブラウザで動作します：

- Chrome 24+
- Firefox 16+
- Safari 10+
- Edge 12+
- Opera 15+

## 📝 ライセンス

MIT License

## 🤝 コントリビューション

バグ報告や機能リクエストは Issue でお願いします。

## 📚 その他のリソース

- [デモページ](examples/demo.html) - インタラクティブなデモ
- [テストスイート](test/test.html) - 自動テスト
- [開発計画](PLAN.md) - 詳細な技術仕様

## 🔄 バージョン履歴

### v2.0.0 (2026-06-03)

Phase 18-19: ALTER TABLE の実装

- ALTER TABLE ADD COLUMN 構文のサポート
  - 既存テーブルへの新しいカラムの追加
  - PRIMARY KEY, NOT NULL, UNIQUE, DEFAULT 制約のサポート
  - 既存データへのDEFAULT値の自動適用
- ALTER TABLE DROP COLUMN 構文のサポート
  - 既存テーブルからのカラムの削除
  - PRIMARY KEYカラムと最後のカラムの削除を禁止
  - データの完全削除

### v1.9.0 (2026-06-03)

Phase 17: DEFAULT制約の実装

- DEFAULT 制約のサポート
  - リテラル値（文字列、数値、NULL）のサポート
  - 特殊関数（CURRENT_TIMESTAMP, CURRENT_DATE, CURRENT_TIME）のサポート
  - INSERT時の自動適用
  - データ型の自動検証と変換

### v1.8.0 (2026-06-03)

Phase 16: UNIQUE制約の実装

- UNIQUE 制約のサポート
  - 重複値の禁止（NULL値は複数許可）
  - INSERT/UPDATE時の自動検証
  - 複数カラムへの適用

### v1.7.5 (2026-06-03)

Phase 15: NOT NULL制約の実装

- NOT NULL 制約のサポート
  - NULL値の挿入を禁止
  - INSERT/UPDATE時の自動検証

### v1.7.0 (2026-06-03)

Phase 14: UTF-8対応の確認と強化

- UTF-8エンコーディングの完全サポート
  - 日本語、中国語、絵文字などのUnicode文字
  - BOMなしUTF-8での出力

### v1.6.5 (2026-06-03)

Phase 13: listTables() と describeTable() の実装

- データベース管理APIの追加
  - `listTables()`: 全テーブル名の一覧取得
  - `describeTable(tableName)`: テーブルスキーマの詳細情報取得
  - PRIMARY KEY情報の取得

### v1.6.0 (2026-06-03)

Phase 12: DROP TABLE の実装

- DROP TABLE 構文のサポート
  - テーブルとデータの完全削除
- DROP TABLE IF EXISTS 構文のサポート
  - テーブルが存在しない場合にエラーを発生させずスキップ

Phase 11: CREATE TABLE IF NOT EXISTS の実装

- CREATE TABLE IF NOT EXISTS 構文のサポート
  - テーブルが既に存在する場合にエラーを発生させずスキップ
  - 既存データの保護

### v1.5.0 (2026-06-03)

Phase 10: カラムエイリアス（AS句）の実装

- SELECT句でのカラムエイリアス（AS句）のサポート
  - 通常のカラムのエイリアス
  - 集約関数のエイリアス
  - SQLキーワードをエイリアス名として使用可能

### v1.4.0 (2026-06-03)

Phase 9: PRIMARY KEY制約の実装

- PRIMARY KEY 制約のサポート
  - NULL値の禁止
  - 重複値の禁止
  - INSERT/UPDATE時の自動検証

### v1.3.0 (2026-06-03)

Phase 8: GROUP BY と HAVING の実装

- GROUP BY 句のサポート
  - 単一カラムおよび複数カラムでのグループ化
  - 集約関数との組み合わせ
- HAVING 句のサポート
  - グループ化後のフィルタリング
  - 集約関数を使用した条件指定

### v1.2.0 (2026-06-03)

Phase 7: 集約関数の実装

- 集約関数のサポート
  - COUNT(*), COUNT(column)
  - SUM(column)
  - AVG(column)
  - MIN(column)
  - MAX(column)
- SELECT句での集約関数の使用
- WHERE句との組み合わせ

### v1.1.0 (2026-06-02)

Phase 6: ORDER BY と LIMIT の実装

- ORDER BY 句のサポート
  - 単一カラムおよび複数カラムでのソート
  - ASC（昇順）/ DESC（降順）の指定
  - 集約関数を使用したソート
- LIMIT 句のサポート
  - 結果件数の制限
  - OFFSET によるページネーション

### v1.0.0 (2026-06-02)

初回リリース

- 基本的な SQL 操作（CREATE TABLE, INSERT, SELECT, UPDATE, DELETE）
- WHERE 句のサポート（比較演算子、AND/OR）
- IndexedDB による永続化
- INTEGER, TEXT, REAL 型のサポート
- DATE, DATETIME 型のサポート
- LIKE 演算子のサポート
- バルクインサートのサポート
- プレースホルダー（位置指定・名前付き）のサポート
- BLOB 型のサポート