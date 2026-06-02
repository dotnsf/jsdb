/**
 * ヘルパー関数
 */

/**
 * データ型を検証
 */
function validateDataType(value, type) {
    switch (type.toUpperCase()) {
        case 'INTEGER':
            return Number.isInteger(value);
        case 'REAL':
            return typeof value === 'number';
        case 'TEXT':
            return typeof value === 'string';
        case 'BLOB':
            return value instanceof Blob ||
                   value instanceof ArrayBuffer ||
                   value instanceof Uint8Array ||
                   ArrayBuffer.isView(value);
        case 'DATE':
        case 'DATETIME':
            return value instanceof Date || !isNaN(Date.parse(value));
        default:
            return true; // 不明な型は許可
    }
}

/**
 * データ型に変換
 */
function convertToDataType(value, type) {
    if (value === null || value === undefined) {
        return null;
    }

    switch (type.toUpperCase()) {
        case 'INTEGER':
            return parseInt(value, 10);
        case 'REAL':
            return parseFloat(value);
        case 'TEXT':
            return String(value);
        case 'BLOB':
            return convertToArrayBuffer(value);
        case 'DATE':
        case 'DATETIME':
            return new Date(value);
        default:
            return value;
    }
}

/**
 * バイナリデータを ArrayBuffer に変換
 */
async function convertToArrayBuffer(value) {
    if (value instanceof ArrayBuffer) {
        return value;
    }
    if (value instanceof Uint8Array || ArrayBuffer.isView(value)) {
        return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
    }
    if (value instanceof Blob) {
        return await value.arrayBuffer();
    }
    throw new Error('Unsupported BLOB data type');
}

/**
 * バイナリデータを同期的に ArrayBuffer に変換（プレースホルダー用）
 */
function convertToArrayBufferSync(value) {
    if (value instanceof ArrayBuffer) {
        return value;
    }
    if (value instanceof Uint8Array || ArrayBuffer.isView(value)) {
        return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
    }
    // Blob は非同期なので、そのまま返す（後で Executor で処理）
    if (value instanceof Blob) {
        return value;
    }
    throw new Error('Unsupported BLOB data type');
}

/**
 * 値を比較
 */
function compareValues(left, operator, right) {
    // NULL チェック
    if (left === null || left === undefined || right === null || right === undefined) {
        if (operator === '=' || operator === '==') {
            return left === right;
        } else if (operator === '!=' || operator === '<>') {
            return left !== right;
        }
        return false;
    }

    // 日付型の比較（Date オブジェクトの場合）
    if (left instanceof Date || right instanceof Date) {
        const leftTime = left instanceof Date ? left.getTime() : new Date(left).getTime();
        const rightTime = right instanceof Date ? right.getTime() : new Date(right).getTime();
        
        switch (operator) {
            case '=':
            case '==':
                return leftTime === rightTime;
            case '!=':
            case '<>':
                return leftTime !== rightTime;
            case '>':
                return leftTime > rightTime;
            case '<':
                return leftTime < rightTime;
            case '>=':
                return leftTime >= rightTime;
            case '<=':
                return leftTime <= rightTime;
            default:
                throw new Error(`Unknown operator: ${operator}`);
        }
    }

    switch (operator) {
        case '=':
        case '==':
            return left == right;
        case '!=':
        case '<>':
            return left != right;
        case '>':
            return left > right;
        case '<':
            return left < right;
        case '>=':
            return left >= right;
        case '<=':
            return left <= right;
        default:
            throw new Error(`Unknown operator: ${operator}`);
    }
}

/**
 * LIKE パターンマッチング
 */
function matchLike(value, pattern) {
    if (value === null || value === undefined) {
        return false;
    }
    
    // 値を文字列に変換
    const str = String(value);
    
    // SQL の LIKE パターンを正規表現に変換
    // % は .* (任意の文字列)、_ は . (任意の1文字) に変換
    const regexPattern = pattern
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // 特殊文字をエスケープ
        .replace(/%/g, '.*')  // % を .* に変換
        .replace(/_/g, '.');  // _ を . に変換
    
    const regex = new RegExp('^' + regexPattern + '$', 'i'); // 大文字小文字を区別しない
    return regex.test(str);
}

/**
 * WHERE 条件を評価
 */
function evaluateWhereCondition(row, condition) {
    if (!condition) {
        return true;
    }

    // 論理演算子の処理
    if (condition.type === 'AND') {
        return evaluateWhereCondition(row, condition.left) &&
               evaluateWhereCondition(row, condition.right);
    }
    if (condition.type === 'OR') {
        return evaluateWhereCondition(row, condition.left) ||
               evaluateWhereCondition(row, condition.right);
    }

    // LIKE 演算の処理
    if (condition.type === 'LIKE') {
        const leftValue = row[condition.left];
        const pattern = condition.pattern;
        return matchLike(leftValue, pattern);
    }

    // 比較演算の処理
    if (condition.type === 'COMPARISON') {
        const leftValue = row[condition.left];
        const rightValue = condition.right;
        return compareValues(leftValue, condition.operator, rightValue);
    }

    return true;
}

/**
 * エラーメッセージを生成
 */
function createError(message, details = null) {
    const error = new Error(message);
    if (details) {
        error.details = details;
    }
    return error;
}
