/**
 * IndexedDBManager - IndexedDB の操作を管理するクラス
 */
class IndexedDBManager {
    constructor(dbName) {
        this.dbName = dbName;
        this.db = null;
        this.version = null;
    }

    /**
     * データベースを開く
     */
    async open() {
        return new Promise((resolve, reject) => {
            // まず現在のバージョンを取得
            const openRequest = indexedDB.open(this.dbName);
            
            openRequest.onsuccess = () => {
                const db = openRequest.result;
                this.version = db.version;
                db.close();
                
                // 正しいバージョンで再オープン
                const request = indexedDB.open(this.dbName, this.version);

                request.onerror = () => {
                    reject(new Error(`Failed to open database: ${request.error}`));
                };

                request.onsuccess = () => {
                    this.db = request.result;
                    resolve(this.db);
                };

                request.onupgradeneeded = (event) => {
                    this.db = event.target.result;
                    
                    if (!this.db.objectStoreNames.contains('__metadata__')) {
                        this.db.createObjectStore('__metadata__', { keyPath: 'key' });
                    }
                };
            };
            
            openRequest.onerror = () => {
                // データベースが存在しない場合は新規作成
                this.version = 1;
                const request = indexedDB.open(this.dbName, this.version);

                request.onerror = () => {
                    reject(new Error(`Failed to open database: ${request.error}`));
                };

                request.onsuccess = () => {
                    this.db = request.result;
                    resolve(this.db);
                };

                request.onupgradeneeded = (event) => {
                    this.db = event.target.result;
                    
                    if (!this.db.objectStoreNames.contains('__metadata__')) {
                        this.db.createObjectStore('__metadata__', { keyPath: 'key' });
                    }
                };
            };
        });
    }

    /**
     * テーブル（オブジェクトストア）を作成
     */
    async createTable(tableName, columns) {
        // バージョンを上げて再オープン
        this.version++;
        this.db.close();

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = () => {
                reject(new Error(`Failed to create table: ${request.error}`));
            };

            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // テーブルストアを作成
                if (!db.objectStoreNames.contains(tableName)) {
                    db.createObjectStore(tableName, { keyPath: '__id__', autoIncrement: true });
                }

                // メタデータストアが存在しない場合は作成
                if (!db.objectStoreNames.contains('__metadata__')) {
                    db.createObjectStore('__metadata__', { keyPath: 'key' });
                }
            };
        });
    }

    /**
     * テーブルのスキーマ情報を保存
     */
    async saveTableSchema(tableName, columns) {
        const transaction = this.db.transaction(['__metadata__'], 'readwrite');
        const store = transaction.objectStore('__metadata__');

        return new Promise((resolve, reject) => {
            const request = store.put({
                key: `schema_${tableName}`,
                tableName: tableName,
                columns: columns
            });

            request.onsuccess = () => resolve();
            request.onerror = () => reject(new Error(`Failed to save schema: ${request.error}`));
        });
    }

    /**
     * テーブルのスキーマ情報を取得
     */
    async getTableSchema(tableName) {
        const transaction = this.db.transaction(['__metadata__'], 'readonly');
        const store = transaction.objectStore('__metadata__');

        return new Promise((resolve, reject) => {
            const request = store.get(`schema_${tableName}`);

            request.onsuccess = () => {
                if (request.result) {
                    resolve(request.result.columns);
                } else {
                    resolve(null);
                }
            };
            request.onerror = () => reject(new Error(`Failed to get schema: ${request.error}`));
        });
    }

    /**
     * テーブルが存在するかチェック
     */
    tableExists(tableName) {
        return this.db.objectStoreNames.contains(tableName);
    }

    /**
     * データを挿入
     */
    async insert(tableName, data) {
        const transaction = this.db.transaction([tableName], 'readwrite');
        const store = transaction.objectStore(tableName);

        return new Promise((resolve, reject) => {
            const request = store.add(data);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(new Error(`Failed to insert data: ${request.error}`));
        });
    }

    /**
     * 全データを取得
     */
    async getAll(tableName) {
        const transaction = this.db.transaction([tableName], 'readonly');
        const store = transaction.objectStore(tableName);

        return new Promise((resolve, reject) => {
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(new Error(`Failed to get all data: ${request.error}`));
        });
    }

    /**
     * データを更新
     */
    async update(tableName, data) {
        const transaction = this.db.transaction([tableName], 'readwrite');
        const store = transaction.objectStore(tableName);

        return new Promise((resolve, reject) => {
            const request = store.put(data);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(new Error(`Failed to update data: ${request.error}`));
        });
    }

    /**
     * データを削除
     */
    async delete(tableName, id) {
        const transaction = this.db.transaction([tableName], 'readwrite');
        const store = transaction.objectStore(tableName);

        return new Promise((resolve, reject) => {
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(new Error(`Failed to delete data: ${request.error}`));
        });
    }

    /**
     * データベースを閉じる
     */
    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}
