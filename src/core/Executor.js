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
            case 'DROP_TABLE':
                return await this.executeDropTable(statement);
            case 'ALTER_TABLE':
                return await this.executeAlterTable(statement);
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
     * DROP TABLE文を実行
     */
    async executeDropTable(statement) {
        const { tableName, ifExists } = statement;

        // テーブルが存在するかチェック
        if (!this.dbManager.tableExists(tableName)) {
            // IF EXISTS が指定されている場合はエラーを出さずに成功を返す
            if (ifExists) {
                return {
                    type: 'DROP_TABLE',
                    success: true,
                    message: `Table '${tableName}' does not exist (skipped)`
                };
            }
            throw new Error(`Table '${tableName}' does not exist`);
        }

        // テーブルを削除
        await this.dbManager.dropTable(tableName);

        return {
            type: 'DROP_TABLE',
            success: true,
            message: `Table '${tableName}' dropped successfully`
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

                // NOT NULL制約のチェック
                if (columnSchema.notNull && (value === null || value === undefined)) {
                    throw new Error(`NOT NULL constraint violation: column '${columnName}' cannot be NULL`);
                }

                // UNIQUE制約のチェック
                if (columnSchema.unique && value !== null && value !== undefined) {
                    const existingRows = await this.dbManager.getAll(tableName);
                    const duplicate = existingRows.find(row => row[columnName] === value);
                    if (duplicate) {
                        throw new Error(`UNIQUE constraint violation: duplicate value '${value}' for column '${columnName}'`);
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

            // 指定されていないカラムにデフォルト値を適用
            for (const columnSchema of schema) {
                const columnName = columnSchema.name;
                
                // カラムが指定されていない場合
                if (!columns.includes(columnName)) {
                    if (columnSchema.defaultValue) {
                        // デフォルト値を適用
                        const defaultVal = this.evaluateDefaultValue(columnSchema.defaultValue);
                        
                        // データ型の検証と変換
                        if (defaultVal !== null) {
                            if (!validateDataType(defaultVal, columnSchema.type)) {
                                throw new Error(`Invalid default value type for column '${columnName}': expected ${columnSchema.type}`);
                            }
                            data[columnName] = convertToDataType(defaultVal, columnSchema.type);
                        } else {
                            data[columnName] = null;
                        }
                    } else if (columnSchema.notNull) {
                        // NOT NULL制約があるのにデフォルト値もない場合はエラー
                        throw new Error(`NOT NULL constraint violation: column '${columnName}' requires a value`);
                    } else {
                        // デフォルト値がない場合はNULL
                        data[columnName] = null;
                    }
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

                // NOT NULL制約のチェック
                if (columnSchema.notNull && (value === null || value === undefined)) {
                    throw new Error(`NOT NULL constraint violation: column '${columnName}' cannot be NULL`);
                }

                // UNIQUE制約のチェック
                if (columnSchema.unique && value !== null && value !== undefined) {
                    // 重複チェック（自分自身以外）
                    const duplicate = rows.find(r => r.__id__ !== row.__id__ && r[columnName] === value);
                    if (duplicate) {
                        throw new Error(`UNIQUE constraint violation: duplicate value '${value}' for column '${columnName}'`);
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

    /**
     * ALTER TABLE 文を実行
     */
    async executeAlterTable(ast) {
        const { tableName, action, column, columnName } = ast;

        if (action === 'ADD_COLUMN') {
            return await this.executeAddColumn(tableName, column);
        } else if (action === 'DROP_COLUMN') {
            return await this.executeDropColumn(tableName, columnName);
        } else {
            throw new Error(`Unsupported ALTER TABLE action: ${action}`);
        }
    }

    /**
     * ADD COLUMN を実行
     */
    async executeAddColumn(tableName, column) {
        // テーブルの存在確認
        const columns = await this.dbManager.getTableSchema(tableName);
        if (!columns) {
            throw new Error(`Table '${tableName}' does not exist`);
        }

        // カラム名の重複チェック
        if (columns.some(col => col.name === column.name)) {
            throw new Error(`Column '${column.name}' already exists in table '${tableName}'`);
        }

        // PRIMARY KEY制約のチェック（テーブルに既にPRIMARY KEYがある場合はエラー）
        if (column.primaryKey) {
            const hasPrimaryKey = columns.some(col => col.primaryKey);
            if (hasPrimaryKey) {
                throw new Error(`Table '${tableName}' already has a PRIMARY KEY`);
            }
        }

        // NOT NULL制約とDEFAULT値のチェック
        if (column.notNull && !column.defaultValue) {
            // 既存の行がある場合、NOT NULL制約を持つカラムにはDEFAULT値が必要
            const existingRows = await this.dbManager.getAll(tableName);
            if (existingRows.length > 0) {
                throw new Error(`Cannot add NOT NULL column '${column.name}' without DEFAULT value to non-empty table`);
            }
        }

        // スキーマを更新
        columns.push({
            name: column.name,
            type: column.type,
            primaryKey: column.primaryKey || false,
            notNull: column.notNull || false,
            unique: column.unique || false,
            defaultValue: column.defaultValue || null
        });

        // PRIMARY KEY情報を取得
        const primaryKey = await this.dbManager.getTablePrimaryKey(tableName);

        await this.dbManager.updateTableSchema(tableName, { columns, primaryKey });

        // 既存の全行に新しいカラムを追加
        const existingRows = await this.dbManager.getAll(tableName);
        
        for (const row of existingRows) {
            let newValue = null;

            // DEFAULT値がある場合は評価
            if (column.defaultValue) {
                newValue = this.evaluateDefaultValue(column.defaultValue);
                // データ型の検証と変換
                if (!validateDataType(newValue, column.type)) {
                    throw new Error(`Invalid default value type for column '${column.name}': expected ${column.type}`);
                }
                newValue = convertToDataType(newValue, column.type);
            }

            // 新しいカラムを追加
            row[column.name] = newValue;

            // NOT NULL制約のチェック
            if (column.notNull && newValue === null) {
                throw new Error(`Column '${column.name}' cannot be NULL`);
            }

            // 行を更新
            await this.dbManager.update(tableName, row);
        }

        // UNIQUE制約がある場合、既存の値の重複チェック
        if (column.unique) {
            const values = existingRows.map(row => row[column.name]);
            const uniqueValues = new Set(values.filter(v => v !== null));
            if (uniqueValues.size !== values.filter(v => v !== null).length) {
                throw new Error(`UNIQUE constraint violation: duplicate values in column '${column.name}'`);
            }
        }

        return {
            type: 'ALTER_TABLE',
            success: true,
            message: `Column '${column.name}' added to table '${tableName}'`
        };
    }

    /**
     * DROP COLUMN を実行
     */
    async executeDropColumn(tableName, columnName) {
        // テーブルの存在確認
        const columns = await this.dbManager.getTableSchema(tableName);
        if (!columns) {
            throw new Error(`Table '${tableName}' does not exist`);
        }

        // カラムの存在確認
        const columnIndex = columns.findIndex(col => col.name === columnName);
        if (columnIndex === -1) {
            throw new Error(`Column '${columnName}' does not exist in table '${tableName}'`);
        }

        // 最後のカラムの削除を禁止
        if (columns.length === 1) {
            throw new Error(`Cannot drop the last column '${columnName}' from table '${tableName}'`);
        }

        // PRIMARY KEYカラムの削除を禁止
        const columnToDelete = columns[columnIndex];
        if (columnToDelete.primaryKey) {
            throw new Error(`Cannot drop PRIMARY KEY column '${columnName}'`);
        }

        // スキーマからカラムを削除
        columns.splice(columnIndex, 1);

        // PRIMARY KEY情報を取得
        const primaryKey = await this.dbManager.getTablePrimaryKey(tableName);

        await this.dbManager.updateTableSchema(tableName, { columns, primaryKey });

        // 既存の全行からカラムを削除
        const existingRows = await this.dbManager.getAll(tableName);
        
        for (const row of existingRows) {
            delete row[columnName];
            await this.dbManager.update(tableName, row);
        }

        return {
            type: 'ALTER_TABLE',
            success: true,
            message: `Column '${columnName}' dropped from table '${tableName}'`
        };
    }

    /**
     * デフォルト値を評価
     */
    evaluateDefaultValue(defaultValue) {
        if (!defaultValue) {
            return null;
        }

        switch (defaultValue.type) {
            case 'STRING':
                return defaultValue.value;
            
            case 'NUMBER':
                return defaultValue.value;
            
            case 'NULL':
                return null;
            
            case 'FUNCTION':
                // 特殊関数の評価
                switch (defaultValue.value) {
                    case 'CURRENT_TIMESTAMP':
                        // ISO 8601形式の日時文字列を返す
                        return new Date().toISOString();
                    
                    case 'CURRENT_DATE':
                        // YYYY-MM-DD形式の日付文字列を返す
                        const date = new Date();
                        return date.toISOString().split('T')[0];
                    
                    case 'CURRENT_TIME':
                        // HH:MM:SS形式の時刻文字列を返す
                        const time = new Date();
                        return time.toISOString().split('T')[1].split('.')[0];
                    
                    default:
                        throw new Error(`Unknown default function: ${defaultValue.value}`);
                }
            
            default:
                throw new Error(`Unknown default value type: ${defaultValue.type}`);
        }
    }
}
