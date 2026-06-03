/**
 * Executor - パースされたSQL文を実行するクラス
 */
class Executor {
    constructor(dbManager) {
        this.dbManager = dbManager;
    }

    /**
     * SQL文を実行
     * @param {Object} statement - パース済みのSQL文
     * @param {Array|Object} params - プレースホルダーのパラメータ
     */
    async execute(statement, params = null) {
        // パラメータバインディング
        if (params) {
            statement = this.bindParameters(statement, params);
        }

        switch (statement.type) {
            case 'CREATE_TABLE':
                return await this.executeCreateTable(statement);
            case 'INSERT':
                return await this.executeInsert(statement);
            case 'SELECT':
                return await this.executeSelect(statement);
            case 'UPDATE':
                return await this.executeUpdate(statement);
            case 'DELETE':
                return await this.executeDelete(statement);
            default:
                throw new Error(`Unsupported statement type: ${statement.type}`);
        }
    }

    /**
     * プレースホルダーにパラメータをバインド
     */
    bindParameters(statement, params) {
        const isPositional = Array.isArray(params);
        let positionalIndex = 0;

        const bindValue = (value) => {
            if (value && typeof value === 'object') {
                if (value.type === 'PLACEHOLDER') {
                    if (!isPositional) {
                        throw new Error('Positional placeholder (?) requires array parameters');
                    }
                    if (positionalIndex >= params.length) {
                        throw new Error(`Not enough parameters provided. Expected at least ${positionalIndex + 1}`);
                    }
                    return params[positionalIndex++];
                } else if (value.type === 'NAMED_PLACEHOLDER') {
                    if (isPositional) {
                        throw new Error(`Named placeholder (:${value.name}) requires object parameters`);
                    }
                    if (!(value.name in params)) {
                        throw new Error(`Missing parameter: ${value.name}`);
                    }
                    return params[value.name];
                }
            }
            return value;
        };

        // ステートメントのディープコピーを作成（バイナリデータを保持）
        const deepCopy = (obj) => {
            if (obj === null || typeof obj !== 'object') return obj;
            if (obj instanceof Date) return new Date(obj);
            if (obj instanceof ArrayBuffer) return obj.slice(0);
            if (ArrayBuffer.isView(obj)) return obj.slice();
            if (obj instanceof Blob) return obj;
            if (Array.isArray(obj)) return obj.map(item => deepCopy(item));
            
            const copy = {};
            for (const key in obj) {
                if (obj.hasOwnProperty(key)) {
                    copy[key] = deepCopy(obj[key]);
                }
            }
            return copy;
        };

        const boundStatement = deepCopy(statement);

        // INSERT文のバインディング
        if (boundStatement.type === 'INSERT') {
            boundStatement.valuesList = boundStatement.valuesList.map(values =>
                values.map(v => bindValue(v))
            );
        }

        // UPDATE文のバインディング
        if (boundStatement.type === 'UPDATE') {
            for (const key in boundStatement.updates) {
                boundStatement.updates[key] = bindValue(boundStatement.updates[key]);
            }
        }

        // WHERE句のバインディング
        if (boundStatement.where) {
            const bindWhereCondition = (condition) => {
                if (!condition) return condition;

                if (condition.type === 'COMPARISON') {
                    condition.right = bindValue(condition.right);
                } else if (condition.type === 'LIKE') {
                    condition.pattern = bindValue(condition.pattern);
                } else if (condition.type === 'AND' || condition.type === 'OR') {
                    condition.left = bindWhereCondition(condition.left);
                    condition.right = bindWhereCondition(condition.right);
                }
                return condition;
            };

            boundStatement.where = bindWhereCondition(boundStatement.where);
        }

        return boundStatement;
    }

    /**
     * CREATE TABLE文を実行
     */
    async executeCreateTable(statement) {
        const { tableName, columns, primaryKey, ifNotExists } = statement;

        // テーブルが既に存在するかチェック
        if (this.dbManager.tableExists(tableName)) {
            // IF NOT EXISTS が指定されている場合はエラーを出さずに成功を返す
            if (ifNotExists) {
                return {
                    type: 'CREATE_TABLE',
                    success: true,
                    message: `Table '${tableName}' already exists (skipped)`
                };
            }
            throw new Error(`Table '${tableName}' already exists`);
        }

        // テーブルを作成
        await this.dbManager.createTable(tableName, columns);

        // スキーマ情報を保存（PRIMARY KEY情報を含む）
        await this.dbManager.saveTableSchema(tableName, columns, primaryKey);

        return {
            type: 'CREATE_TABLE',
            success: true,
            message: `Table '${tableName}' created successfully`
        };
    }

    /**
     * INSERT文を実行（バルクインサート対応）
     */
    async executeInsert(statement) {
        const { tableName, columns, valuesList } = statement;

        // テーブルの存在チェック
        if (!this.dbManager.tableExists(tableName)) {
            throw new Error(`Table '${tableName}' does not exist`);
        }

        // スキーマを取得
        const schema = await this.dbManager.getTableSchema(tableName);
        if (!schema) {
            throw new Error(`Schema for table '${tableName}' not found`);
        }

        // PRIMARY KEY情報を取得
        const primaryKey = await this.dbManager.getTablePrimaryKey(tableName);

        // 複数行を挿入
        const insertedIds = [];
        for (const values of valuesList) {
            // データオブジェクトを作成
            const data = {};
            for (let i = 0; i < columns.length; i++) {
                const columnName = columns[i];
                const value = values[i];

                // カラムがスキーマに存在するかチェック
                const columnSchema = schema.find(col => col.name === columnName);
                if (!columnSchema) {
                    throw new Error(`Column '${columnName}' does not exist in table '${tableName}'`);
                }

                // PRIMARY KEY制約のチェック
                if (primaryKey && columnName === primaryKey) {
                    // NULL値の禁止
                    if (value === null || value === undefined) {
                        throw new Error(`PRIMARY KEY column '${columnName}' cannot be NULL`);
                    }
                    
                    // 重複チェック
                    const existingRows = await this.dbManager.getAll(tableName);
                    const duplicate = existingRows.find(row => row[columnName] === value);
                    if (duplicate) {
                        throw new Error(`PRIMARY KEY constraint violation: duplicate value '${value}' for column '${columnName}'`);
                    }
                }

                // データ型の検証と変換
                if (value !== null) {
                    if (!validateDataType(value, columnSchema.type)) {
                        throw new Error(`Invalid data type for column '${columnName}': expected ${columnSchema.type}`);
                    }
                    // BLOB 型の場合は非同期変換が必要な場合がある
                    if (columnSchema.type.toUpperCase() === 'BLOB') {
                        data[columnName] = await convertToArrayBuffer(value);
                    } else {
                        data[columnName] = convertToDataType(value, columnSchema.type);
                    }
                } else {
                    data[columnName] = null;
                }
            }

            // データを挿入
            const id = await this.dbManager.insert(tableName, data);
            insertedIds.push(id);
        }

        return {
            type: 'INSERT',
            success: true,
            insertedIds: insertedIds,
            rowCount: insertedIds.length
        };
    }

    /**
     * SELECT文を実行
     */
    async executeSelect(statement) {
        const { tableName, columns, where, groupBy, having, orderBy, limit, offset } = statement;

        // テーブルの存在チェック
        if (!this.dbManager.tableExists(tableName)) {
            throw new Error(`Table '${tableName}' does not exist`);
        }

        // 全データを取得
        let rows = await this.dbManager.getAll(tableName);

        // WHERE句でフィルタリング
        if (where) {
            rows = rows.filter(row => evaluateWhereCondition(row, where));
        }

        // GROUP BY句の処理
        if (groupBy && groupBy.length > 0) {
            return this.executeGroupBy(rows, columns, groupBy, having, orderBy, limit, offset);
        }

        // 集約関数のチェック（GROUP BY なし）
        const hasAggregates = columns.some(col => typeof col === 'object' && col.type === 'AGGREGATE');

        if (hasAggregates) {
            // 集約関数の処理（GROUP BY なし）
            const result = {};
            for (const col of columns) {
                if (typeof col === 'object' && col.type === 'AGGREGATE') {
                    const { function: funcName, argument, alias } = col;
                    const columnName = alias || `${funcName}(${argument})`;
                    result[columnName] = this.calculateAggregate(funcName, argument, rows);
                }
            }
            return {
                type: 'SELECT',
                success: true,
                rows: [result],
                rowCount: 1
            };
        }

        // ORDER BY句でソート
        if (orderBy && orderBy.length > 0) {
            rows.sort((a, b) => {
                for (const order of orderBy) {
                    const { column, direction } = order;
                    const aVal = a[column];
                    const bVal = b[column];
                    
                    let comparison = 0;
                    if (aVal < bVal) comparison = -1;
                    else if (aVal > bVal) comparison = 1;
                    
                    if (comparison !== 0) {
                        return direction === 'DESC' ? -comparison : comparison;
                    }
                }
                return 0;
            });
        }

        // OFFSET と LIMIT を適用
        if (offset !== null && offset !== undefined) {
            rows = rows.slice(offset);
        }
        if (limit !== null && limit !== undefined) {
            rows = rows.slice(0, limit);
        }

        // カラムの選択（エイリアス対応）
        if (!columns.includes('*')) {
            rows = rows.map(row => {
                const selectedRow = {};
                for (const col of columns) {
                    if (typeof col === 'object' && col.type === 'COLUMN') {
                        // エイリアス付きカラム
                        const { name, alias } = col;
                        if (row.hasOwnProperty(name)) {
                            selectedRow[alias] = row[name];
                        }
                    } else if (typeof col === 'string' && row.hasOwnProperty(col)) {
                        // 通常のカラム
                        selectedRow[col] = row[col];
                    }
                }
                return selectedRow;
            });
        }

        return {
            type: 'SELECT',
            success: true,
            rows: rows,
            rowCount: rows.length
        };
    }

    /**
     * 集約関数を計算
     */
    calculateAggregate(funcName, argument, rows) {
        switch (funcName) {
            case 'COUNT':
                if (argument === '*') {
                    return rows.length;
                } else {
                    // NULL を除いてカウント
                    return rows.filter(row => row[argument] !== null && row[argument] !== undefined).length;
                }
            
            case 'SUM':
                return rows.reduce((sum, row) => {
                    const value = row[argument];
                    if (value !== null && value !== undefined && typeof value === 'number') {
                        return sum + value;
                    }
                    return sum;
                }, 0);
            
            case 'AVG':
                const values = rows.filter(row => {
                    const value = row[argument];
                    return value !== null && value !== undefined && typeof value === 'number';
                }).map(row => row[argument]);
                
                if (values.length === 0) return null;
                return values.reduce((sum, val) => sum + val, 0) / values.length;
            
            case 'MIN':
                const minValues = rows.filter(row => {
                    const value = row[argument];
                    return value !== null && value !== undefined;
                }).map(row => row[argument]);
                
                if (minValues.length === 0) return null;
                return Math.min(...minValues);
            
            case 'MAX':
                const maxValues = rows.filter(row => {
                    const value = row[argument];
                    return value !== null && value !== undefined;
                }).map(row => row[argument]);
                
                if (maxValues.length === 0) return null;
                return Math.max(...maxValues);
            
            default:
                throw new Error(`Unsupported aggregate function: ${funcName}`);
        }
    }

    /**
     * GROUP BY句を実行
     */
    executeGroupBy(rows, columns, groupBy, having, orderBy, limit, offset) {
        // グループ化
        const groups = {};
        
        for (const row of rows) {
            // グループキーを生成
            const groupKey = groupBy.map(col => row[col]).join('|');
            
            if (!groups[groupKey]) {
                groups[groupKey] = [];
            }
            groups[groupKey].push(row);
        }
        
        // 各グループに対して集約関数を計算
        const results = [];
        for (const groupKey in groups) {
            const groupRows = groups[groupKey];
            const result = {};
            
            // グループ化カラムの値を設定
            for (let i = 0; i < groupBy.length; i++) {
                const colName = groupBy[i];
                result[colName] = groupRows[0][colName];
            }
            
            // 集約関数を計算（エイリアス対応）
            for (const col of columns) {
                if (typeof col === 'object' && col.type === 'AGGREGATE') {
                    const { function: funcName, argument, alias } = col;
                    const columnName = alias || `${funcName}(${argument})`;
                    result[columnName] = this.calculateAggregate(funcName, argument, groupRows);
                } else if (typeof col === 'object' && col.type === 'COLUMN') {
                    // エイリアス付きカラム
                    const { name, alias } = col;
                    if (!groupBy.includes(name)) {
                        result[alias] = groupRows[0][name];
                    }
                } else if (typeof col === 'string' && !groupBy.includes(col)) {
                    // GROUP BY に含まれないカラムは無視（または最初の値を使用）
                    result[col] = groupRows[0][col];
                }
            }
            
            results.push(result);
        }
        
        // HAVING句でフィルタリング
        let filteredResults = results;
        if (having) {
            filteredResults = results.filter(result => {
                const { function: funcName, argument, operator, value } = having;
                const columnName = `${funcName}(${argument})`;
                const aggregateValue = result[columnName];
                
                return this.compareValues(aggregateValue, operator, value);
            });
        }
        
        // ORDER BY句でソート
        if (orderBy && orderBy.length > 0) {
            filteredResults.sort((a, b) => {
                for (const order of orderBy) {
                    const { column, direction } = order;
                    const aVal = a[column];
                    const bVal = b[column];
                    
                    let comparison = 0;
                    if (aVal < bVal) comparison = -1;
                    else if (aVal > bVal) comparison = 1;
                    
                    if (comparison !== 0) {
                        return direction === 'DESC' ? -comparison : comparison;
                    }
                }
                return 0;
            });
        }
        
        // OFFSET と LIMIT を適用
        if (offset !== null && offset !== undefined) {
            filteredResults = filteredResults.slice(offset);
        }
        if (limit !== null && limit !== undefined) {
            filteredResults = filteredResults.slice(0, limit);
        }
        
        return {
            type: 'SELECT',
            success: true,
            rows: filteredResults,
            rowCount: filteredResults.length
        };
    }

    /**
     * 値を比較
     */
    compareValues(left, operator, right) {
        switch (operator) {
            case '=': return left === right;
            case '!=': return left !== right;
            case '>': return left > right;
            case '<': return left < right;
            case '>=': return left >= right;
            case '<=': return left <= right;
            default: return false;
        }
    }

    /**
     * UPDATE文を実行
     */
    async executeUpdate(statement) {
        const { tableName, updates, where } = statement;

        // テーブルの存在チェック
        if (!this.dbManager.tableExists(tableName)) {
            throw new Error(`Table '${tableName}' does not exist`);
        }

        // スキーマを取得
        const schema = await this.dbManager.getTableSchema(tableName);
        if (!schema) {
            throw new Error(`Schema for table '${tableName}' not found`);
        }

        // PRIMARY KEY情報を取得
        const primaryKey = await this.dbManager.getTablePrimaryKey(tableName);

        // 全データを取得
        let rows = await this.dbManager.getAll(tableName);

        // WHERE句でフィルタリング
        let targetRows = rows;
        if (where) {
            targetRows = rows.filter(row => evaluateWhereCondition(row, where));
        }

        // 更新を実行
        let updatedCount = 0;
        for (const row of targetRows) {
            // 更新データを適用
            for (const [columnName, value] of Object.entries(updates)) {
                // カラムがスキーマに存在するかチェック
                const columnSchema = schema.find(col => col.name === columnName);
                if (!columnSchema) {
                    throw new Error(`Column '${columnName}' does not exist in table '${tableName}'`);
                }

                // PRIMARY KEY制約のチェック
                if (primaryKey && columnName === primaryKey) {
                    // NULL値の禁止
                    if (value === null || value === undefined) {
                        throw new Error(`PRIMARY KEY column '${columnName}' cannot be NULL`);
                    }
                    
                    // 重複チェック（自分自身以外）
                    const duplicate = rows.find(r => r.__id__ !== row.__id__ && r[columnName] === value);
                    if (duplicate) {
                        throw new Error(`PRIMARY KEY constraint violation: duplicate value '${value}' for column '${columnName}'`);
                    }
                }

                // データ型の検証と変換
                if (value !== null) {
                    if (!validateDataType(value, columnSchema.type)) {
                        throw new Error(`Invalid data type for column '${columnName}': expected ${columnSchema.type}`);
                    }
                    // BLOB 型の場合は非同期変換が必要な場合がある
                    if (columnSchema.type.toUpperCase() === 'BLOB') {
                        row[columnName] = await convertToArrayBuffer(value);
                    } else {
                        row[columnName] = convertToDataType(value, columnSchema.type);
                    }
                } else {
                    row[columnName] = null;
                }
            }

            // データベースを更新
            await this.dbManager.update(tableName, row);
            updatedCount++;
        }

        return {
            type: 'UPDATE',
            success: true,
            rowCount: updatedCount
        };
    }

    /**
     * DELETE文を実行
     */
    async executeDelete(statement) {
        const { tableName, where } = statement;

        // テーブルの存在チェック
        if (!this.dbManager.tableExists(tableName)) {
            throw new Error(`Table '${tableName}' does not exist`);
        }

        // 全データを取得
        let rows = await this.dbManager.getAll(tableName);

        // WHERE句でフィルタリング
        let targetRows = rows;
        if (where) {
            targetRows = rows.filter(row => evaluateWhereCondition(row, where));
        }

        // 削除を実行
        let deletedCount = 0;
        for (const row of targetRows) {
            await this.dbManager.delete(tableName, row.__id__);
            deletedCount++;
        }

        return {
            type: 'DELETE',
            success: true,
            rowCount: deletedCount
        };
    }
}
