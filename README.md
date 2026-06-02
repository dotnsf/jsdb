# JSDB - JavaScript SQL Database

ブラウザで動作する軽量 SQL データベースライブラリ

## 📋 概要

JSDB は、ブラウザ上で SQL を使ってデータを管理できる軽量ライブラリです。IndexedDB を使用してデータを永続化するため、ページをリロードしてもデータが保持されます。

## ✨ 特徴

- 🚀 **シンプルな API** - `new JSDB("dbname")` と `db.execute(SQL)` だけで使える
- 💾 **データ永続化** - IndexedDB を使用してブラウザにデータを保存
- 📝 **SQL サポート** - CREATE TABLE, SELECT, INSERT, UPDATE, DELETE
- 🔍 **WHERE 句** - 比較演算子（=, !=, >, <, >=, <=）と論理演算子（AND, OR）
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
<script src="https://raw.githubusercontent.com/dotnsf/jsdb/refs/heads/main/jsdb.js"></script>
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

**サポートされるデータ型:**
- `INTEGER` - 整数
- `TEXT` - 文字列
- `REAL` - 浮動小数点数
- `BLOB` - バイナリデータ（ArrayBuffer, Uint8Array, Blob）
- `DATE` - 日付
- `DATETIME` - 日時

**例:**
```javascript
await db.execute("CREATE TABLE products (id INTEGER, name TEXT, price REAL)");
```

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
- 集約関数（COUNT, SUM, AVG など）
- ORDER BY, LIMIT, GROUP BY
- PRIMARY KEY, FOREIGN KEY 制約
- DATE/DATETIME, BLOB 型（将来対応予定）

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

### v1.0.0 (2026-06-02)

初回リリース

- 基本的な SQL 操作（CREATE TABLE, INSERT, SELECT, UPDATE, DELETE）
- WHERE 句のサポート（比較演算子、AND/OR）
- IndexedDB による永続化
- INTEGER, TEXT, REAL 型のサポート