import { runtime } from "./runtime";
import { MAX_SIZE_32 } from "./util/allocator";
import { compareImpl, parse, CharCode, isWhiteSpaceOrLineTerminator } from "./util/string";

@sealed export abstract class String {
  // @ts-ignore: decorator
  @lazy static readonly MAX_LENGTH: i32 = (MAX_SIZE_32 - runtime.Header.SIZE) >> alignof<u16>();

  get length(): i32 {
    return changetype<runtime.Header>(changetype<usize>(this) - runtime.Header.SIZE).payloadSize >> 1;
  }

  // TODO Add and handle second argument
  static fromCharCode(code: i32): String {
    var out = runtime.allocRaw(2);
    store<u16>(out, <u16>code);
    return runtime.register<String>(out);
  }

  static fromCodePoint(code: i32): String {
    assert(<u32>code <= 0x10FFFF);
    var sur = code > 0xFFFF;
    // @ts-ignore: type
    var out = runtime.allocRaw((<i32>sur + 1) << 1);
    if (!sur) {
      store<u16>(out, <u16>code);
    } else {
      code -= 0x10000;
      let hi: u32 = (code >>> 10)  + 0xD800;
      let lo: u32 = (code & 0x3FF) + 0xDC00;
      store<u32>(out, (hi << 16) | lo);
    }
    return runtime.register<String>(out);
  }

  @operator("[]") charAt(pos: i32): String {
    assert(this !== null);
    if (<u32>pos >= <u32>this.length) return changetype<String>("");
    var out = runtime.allocRaw(2);
    store<u16>(out, load<u16>(changetype<usize>(this) + (<usize>pos << 1)));
    return runtime.register<String>(out);
  }

  charCodeAt(pos: i32): i32 {
    assert(this !== null);
    if (<u32>pos >= <u32>this.length) return -1; // (NaN)
    return load<u16>(changetype<usize>(this) + (<usize>pos << 1));
  }

  codePointAt(pos: i32): i32 {
    assert(this !== null);
    if (<u32>pos >= <u32>this.length) return -1; // (undefined)
    var first = <i32>load<u16>(changetype<usize>(this) + (<usize>pos << 1));
    if (first < 0xD800 || first > 0xDBFF || pos + 1 == this.length) return first;
    var second = <i32>load<u16>(changetype<usize>(this) + ((<usize>pos + 1) << 1));
    if (second < 0xDC00 || second > 0xDFFF) return first;
    return ((first - 0xD800) << 10) + (second - 0xDC00) + 0x10000;
  }

  @operator("+") static concat(left: String, right: String): String {
    if (!changetype<usize>(left)) left = changetype<String>("null");
    return left.concat(right);
  }

  concat(other: String): String {
    assert(this !== null);
    if (other === null) other = changetype<String>("null");
    var thisSize: isize = this.length << 1;
    var otherSize: isize = other.length << 1;
    var outSize: usize = thisSize + otherSize;
    if (outSize == 0) return changetype<String>("");
    var out = runtime.allocRaw(outSize);
    memory.copy(out, changetype<usize>(this), thisSize);
    memory.copy(out + thisSize, changetype<usize>(other), otherSize);
    return runtime.register<String>(out);
  }

  endsWith(searchString: String, endPosition: i32 = String.MAX_LENGTH): bool {
    assert(this !== null);
    if (searchString === null) return false;
    var end = min(max(endPosition, 0), this.length);
    var searchLength: isize = searchString.length;
    var start: isize = end - searchLength;
    if (start < 0) return false;
    // @ts-ignore: string/String
    return !compareImpl(this, start, searchString, 0, searchLength);
  }

  @operator("==") static eq(left: String, right: String): bool {
    if (left === right) return true;
    if (left === null || right === null) return false;
    var leftLength = left.length;
    if (leftLength != right.length) return false;
    // @ts-ignore: string/String
    return !compareImpl(left, 0, right, 0, leftLength);
  }

  @operator("!=") static ne(left: String, right: String): bool {
    return !this.eq(left, right);
  }

  @operator(">") static gt(left: String, right: String): bool {
    if (left === right || left === null || right === null) return false;
    var leftLength  = left.length;
    var rightLength = right.length;
    if (!leftLength)  return false;
    if (!rightLength) return true;
    // @ts-ignore: string/String
    return compareImpl(left, 0, right, 0, min(leftLength, rightLength)) > 0;
  }

  @operator(">=") static gte(left: String, right: String): bool {
    return !this.lt(left, right);
  }

  @operator("<") static lt(left: String, right: String): bool {
    if (left === right || left === null || right === null) return false;
    var leftLength  = left.length;
    var rightLength = right.length;
    if (!rightLength) return false;
    if (!leftLength)  return true;
    // @ts-ignore: string/String
    return compareImpl(left, 0, right, 0, min(leftLength, rightLength)) < 0;
  }

  @operator("<=") static lte(left: String, right: String): bool {
    return !this.gt(left, right);
  }

  @inline includes(searchString: String, position: i32 = 0): bool {
    return this.indexOf(searchString, position) != -1;
  }

  indexOf(searchString: String, fromIndex: i32 = 0): i32 {
    assert(this !== null);
    if (searchString === null) searchString = changetype<String>("null");
    var searchLen: isize = searchString.length;
    if (!searchLen) return 0;
    var len: isize = this.length;
    if (!len) return -1;
    var start = min<isize>(max<isize>(fromIndex, 0), len);
    len -= searchLen;
    for (let k: isize = start; k <= len; ++k) {
      // @ts-ignore: string/String
      if (!compareImpl(this, k, searchString, 0, searchLen)) return <i32>k;
    }
    return -1;
  }

  lastIndexOf(searchString: String, fromIndex: i32 = i32.MAX_VALUE): i32 {
    assert(this !== null);
    if (searchString === null) searchString = changetype<String>("null");
    var len: isize = this.length;
    var searchLen: isize = searchString.length;
    if (!searchLen) return len;
    if (!len) return -1;
    var start = min<isize>(max(fromIndex, 0), len - searchLen);
    for (let k = start; k >= 0; --k) {
      // @ts-ignore: string/String
      if (!compareImpl(this, k, searchString, 0, searchLen)) return <i32>k;
    }
    return -1;
  }

  startsWith(searchString: String, position: i32 = 0): bool {
    assert(this !== null);
    if (searchString === null) searchString = changetype<String>("null");
    var pos: isize = position;
    var len: isize = this.length;
    var start = min(max(pos, 0), len);
    var searchLength: isize = searchString.length;
    if (searchLength + start > len) return false;
    // @ts-ignore: string/String
    return !compareImpl(this, start, searchString, 0, searchLength);
  }

  substr(start: i32, length: i32 = i32.MAX_VALUE): String {
    assert(this !== null);
    var intStart: isize = start;
    var end: isize = length;
    var size: isize = this.length;
    if (intStart < 0) intStart = max(size + intStart, 0);
    var resultLength = min(max(end, 0), size - intStart);
    if (resultLength <= 0) return changetype<String>("");
    var out = runtime.allocRaw(resultLength << 1);
    memory.copy(out, changetype<usize>(this) + intStart, resultLength);
    return runtime.register<String>(out);
  }

  substring(start: i32, end: i32 = i32.MAX_VALUE): String {
    assert(this !== null);
    var len: isize = this.length;
    var finalStart = min<isize>(max(start, 0), len);
    var finalEnd = min<isize>(max(end, 0), len);
    var fromPos = min<isize>(finalStart, finalEnd) << 1;
    var toPos = max<isize>(finalStart, finalEnd) << 1;
    len = toPos - fromPos;
    if (!len) return changetype<String>("");
    if (!fromPos && toPos == this.length << 1) return this;
    var out = runtime.allocRaw(len);
    memory.copy(out, changetype<usize>(this) + fromPos, len);
    return runtime.register<String>(out);
  }

  trim(): String {
    assert(this !== null);
    var length = this.length;
    var size: usize = length << 1;
    while (
      size &&
      isWhiteSpaceOrLineTerminator(
        load<u16>(changetype<usize>(this) + size)
      )
    ) {
      size -= 2;
    }
    var offset: usize = 0;
    while (
      offset < size &&
      isWhiteSpaceOrLineTerminator(
        load<u16>(changetype<usize>(this) + offset)
      )
    ) {
      offset += 2; size -= 2;
    }
    if (!size) return changetype<String>("");
    if (!start && size == length << 1) return this;
    var out = runtime.allocRaw(size);
    memory.copy(out, changetype<usize>(this) + offset, size);
    return runtime.register<String>(out);
  }

  @inline
  trimLeft(): String {
    return this.trimStart();
  }

  @inline
  trimRight(): String {
    return this.trimEnd();
  }

  trimStart(): String {
    assert(this !== null);
    var size = <usize>this.length << 1;
    var offset: usize = 0;
    while (
      offset < size &&
      isWhiteSpaceOrLineTerminator(
        load<u16>(changetype<usize>(this) + offset)
      )
    ) {
      offset += 2;
    }
    if (!offset) return this;
    size -= offset;
    if (!size) return changetype<String>("");
    var out = runtime.allocRaw(size);
    memory.copy(out, changetype<usize>(this) + offset, size);
    return runtime.register<String>(out);
  }

  trimEnd(): String {
    assert(this !== null);
    var originalSize = <usize>this.length << 1;
    var size = originalSize;
    while (
      size &&
      isWhiteSpaceOrLineTerminator(
        load<u16>(changetype<usize>(this) + size)
      )
    ) {
      size -= 2;
    }
    if (!size) return changetype<String>("");
    if (size == originalSize) return this;
    var out = runtime.allocRaw(size);
    memory.copy(out, changetype<usize>(this), size);
    return runtime.register<String>(out);
  }

  padStart(targetLength: i32, padString: string = " "): String {
    assert(this !== null);
    var thisSize = <usize>this.length << 1;
    var targetSize = <usize>targetLength << 1;
    var padSize = <usize>padString.length << 1;
    if (targetSize < thisSize || !padSize) return this;
    var prependSize = targetSize - thisSize;
    var out = runtime.allocRaw(targetSize);
    if (prependSize > padSize) {
      let repeatCount = (prependSize - 2) / padSize;
      let restBase = repeatCount * padSize;
      let restSize = prependSize - restBase;
      memory.repeat(out, changetype<usize>(padString), padSize, repeatCount);
      memory.copy(out + restBase, changetype<usize>(padString), restSize);
    } else {
      memory.copy(out, changetype<usize>(padString), prependSize);
    }
    memory.copy(out + prependSize, changetype<usize>(this), thisSize);
    return runtime.register<String>(out);
  }

  padEnd(targetLength: i32, padString: string = " "): String {
    assert(this !== null);
    var thisSize = <usize>this.length << 1;
    var targetSize = <usize>targetLength << 1;
    var padSize = <usize>padString.length << 1;
    if (targetSize < thisSize || !padSize) return this;
    var appendSize = targetSize - thisSize;
    var out = runtime.allocRaw(targetSize);
    memory.copy(out, changetype<usize>(this), thisSize);
    if (appendSize > padSize) {
      let repeatCount = (appendSize - 2) / padSize;
      let restBase = repeatCount * padSize;
      let restSize = appendSize - restBase;
      memory.repeat(out + thisSize, changetype<usize>(padString), padSize, repeatCount);
      memory.copy(out + thisSize + restBase, changetype<usize>(padString), restSize);
    } else {
      memory.copy(out + thisSize, changetype<usize>(padString), appendSize);
    }
    return runtime.register<String>(out);
  }

  repeat(count: i32 = 0): String {
    assert(this !== null);
    var length = this.length;

    // Most browsers can't handle strings 1 << 28 chars or longer
    if (count < 0 || <u64>length * count > (1 << 28)) {
      throw new RangeError("Invalid count value");
    }

    if (count == 0 || !length) return changetype<String>("");
    if (count == 1) return this;
    var out = runtime.allocRaw((length * count) << 1);
    memory.repeat(out, changetype<usize>(this), <usize>length << 1, count);
    return runtime.register<String>(out);
  }

  slice(beginIndex: i32, endIndex: i32 = i32.MAX_VALUE): String {
    var len = this.length;
    var begin = beginIndex < 0 ? max(beginIndex + len, 0) : min(beginIndex, len);
    var end = endIndex < 0 ? max(endIndex + len, 0) : min(endIndex, len);
    len = end - begin;
    if (len <= 0) return changetype<String>("");
    var out = runtime.allocRaw(len << 1);
    memory.copy(out, changetype<usize>(this) + (<usize>begin << 1), <usize>len << 1);
    return runtime.register<String>(out);
  }

  split(separator: String | null = null, limit: i32 = i32.MAX_VALUE): String[] {
    assert(this !== null);
    if (!limit) return new Array<String>();
    if (separator === null) return <String[]>[this];
    var length: isize = this.length;
    var sepLen: isize = separator.length;
    if (limit < 0) limit = i32.MAX_VALUE;
    if (!sepLen) {
      if (!length) return new Array<String>();
      // split by chars
      length = min<isize>(length, <isize>limit);
      let result = new Array<String>(length);
      let buffer = unreachable(); // TODO
      // let buffer = <ArrayBuffer>result.buffer_;
      for (let i: isize = 0; i < length; ++i) {
        let char = runtime.allocRaw(2);
        store<u16>(
          changetype<usize>(char),
          load<u16>(
            changetype<usize>(this) + (<usize>i << 1)
          )
        );
        store<usize>(changetype<usize>(buffer) + (<usize>i << 1), char);
      }
      return result;
    } else if (!length) {
      let result = new Array<String>(1);
      unchecked(result[0] = changetype<String>(""));
      return result;
    }
    var result = new Array<String>();
    var end = 0, start = 0, i = 0;
    while ((end = this.indexOf(separator!, start)) != -1) {
      let len = end - start;
      if (len > 0) {
        let out = runtime.allocRaw(<usize>len << 1);
        memory.copy(out, changetype<usize>(this) + (<usize>start << 1), <usize>len << 1);
        result.push(runtime.register<String>(out));
      } else {
        result.push(changetype<String>(""));
      }
      if (++i == limit) return result;
      start = end + sepLen;
    }
    if (!start) {
      let result = new Array<String>(1);
      unchecked(result[0] = this);
      return result;
    }
    var len = length - start;
    if (len > 0) {
      let out = runtime.allocRaw(<usize>len << 1);
      memory.copy(out, changetype<usize>(this) + (<usize>start << 1), <usize>len << 1);
      result.push(runtime.register<String>(out));
    } else {
      result.push(changetype<String>(""));
    }
    return result;
  }

  toString(): String {
    return this;
  }

  get lengthUTF8(): i32 {
    var len = 1; // null terminated
    var pos: usize = 0;
    var end = <usize>this.length;
    while (pos < end) {
      let c = <u32>load<u16>(changetype<usize>(this) + (pos << 1));
      if (c < 128) {
        len += 1; ++pos;
      } else if (c < 2048) {
        len += 2; ++pos;
      } else {
        if (
          (c & 0xFC00) == 0xD800 && pos + 1 < end &&
          (<u32>load<u16>(changetype<usize>(this) + ((pos + 1) << 1)) & 0xFC00) == 0xDC00
        ) {
          len += 4; pos += 2;
        } else {
          len += 3; ++pos;
        }
      }
    }
    return len;
  }

  static fromUTF8(ptr: usize, len: usize): string {
    if (len < 1) return changetype<string>("");
    var ptrPos = <usize>0;
    var buf = memory.allocate(<usize>len << 1);
    var bufPos = <usize>0;
    while (ptrPos < len) {
      let cp = <u32>load<u8>(ptr + ptrPos++);
      if (cp < 128) {
        store<u16>(buf + bufPos, cp);
        bufPos += 2;
      } else if (cp > 191 && cp < 224) {
        assert(ptrPos + 1 <= len);
        store<u16>(buf + bufPos, (cp & 31) << 6 | load<u8>(ptr + ptrPos++) & 63);
        bufPos += 2;
      } else if (cp > 239 && cp < 365) {
        assert(ptrPos + 3 <= len);
        cp = (
          (cp                       &  7) << 18 |
          (load<u8>(ptr + ptrPos++) & 63) << 12 |
          (load<u8>(ptr + ptrPos++) & 63) << 6  |
           load<u8>(ptr + ptrPos++) & 63
        ) - 0x10000;
        store<u16>(buf + bufPos, 0xD800 + (cp >> 10));
        bufPos += 2;
        store<u16>(buf + bufPos, 0xDC00 + (cp & 1023));
        bufPos += 2;
      } else {
        assert(ptrPos + 2 <= len);
        store<u16>(buf + bufPos,
          (cp                       & 15) << 12 |
          (load<u8>(ptr + ptrPos++) & 63) << 6  |
           load<u8>(ptr + ptrPos++) & 63
        );
        bufPos += 2;
      }
    }
    assert(ptrPos == len);
    var out = runtime.allocRaw(bufPos);
    memory.copy(changetype<usize>(out), buf, bufPos);
    memory.free(buf);
    return runtime.register<string>(out);
  }

  toUTF8(): usize {
    var buf = memory.allocate(<usize>this.lengthUTF8);
    var pos: usize = 0;
    var end = <usize>this.length;
    var off: usize = 0;
    while (pos < end) {
      let c1 = <u32>load<u16>(changetype<usize>(this) + (pos << 1));
      if (c1 < 128) {
        store<u8>(buf + off, c1);
        ++off; ++pos;
      } else if (c1 < 2048) {
        let ptr = buf + off;
        store<u8>(ptr, c1 >> 6      | 192);
        store<u8>(ptr, c1      & 63 | 128, 1);
        off += 2; ++pos;
      } else {
        let ptr = buf + off;
        if ((c1 & 0xFC00) == 0xD800 && pos + 1 < end) {
          let c2 = <u32>load<u16>(changetype<usize>(this) + ((pos + 1) << 1));
          if ((c2 & 0xFC00) == 0xDC00) {
            c1 = 0x10000 + ((c1 & 0x03FF) << 10) + (c2 & 0x03FF);
            store<u8>(ptr, c1 >> 18      | 240);
            store<u8>(ptr, c1 >> 12 & 63 | 128, 1);
            store<u8>(ptr, c1 >> 6  & 63 | 128, 2);
            store<u8>(ptr, c1       & 63 | 128, 3);
            off += 4; pos += 2;
            continue;
          }
        }
        store<u8>(ptr, c1 >> 12      | 224);
        store<u8>(ptr, c1 >> 6  & 63 | 128, 1);
        store<u8>(ptr, c1       & 63 | 128, 2);
        off += 3; ++pos;
      }
    }
    store<u8>(buf + off, 0);
    return buf;
  }
}

// @ts-ignore: nolib
export type string = String;

export function parseInt(str: String, radix: i32 = 0): f64 {
  // @ts-ignore: string/String
  return parse<f64>(str, radix);
}

export function parseI32(str: String, radix: i32 = 0): i32 {
  // @ts-ignore: string/String
  return parse<i32>(str, radix);
}

export function parseI64(str: String, radix: i32 = 0): i64 {
  // @ts-ignore: string/String
  return parse<i64>(str, radix);
}

// FIXME: naive implementation
export function parseFloat(str: String): f64 {
  var len: i32 = str.length;
  if (!len) return NaN;

  var ptr = changetype<usize>(str) /* + HEAD -> offset */;
  var code = <i32>load<u16>(ptr);

  // determine sign
  var sign: f64;
  if (code == CharCode.MINUS) {
    if (!--len) return NaN;
    code = <i32>load<u16>(ptr += 2);
    sign = -1;
  } else if (code == CharCode.PLUS) {
    if (!--len) return NaN;
    code = <i32>load<u16>(ptr += 2);
    sign = 1;
  } else {
    sign = 1;
  }

  // calculate value
  var num: f64 = 0;
  while (len--) {
    code = <i32>load<u16>(ptr);
    if (code == CharCode.DOT) {
      ptr += 2;
      let fac: f64 = 0.1; // precision :(
      while (len--) {
        code = <i32>load<u16>(ptr);
        if (code == CharCode.E || code == CharCode.e) {
          assert(false); // TODO
        }
        code -= CharCode._0;
        if (<u32>code > 9) break;
        num += <f64>code * fac;
        fac *= 0.1;
        ptr += 2;
      }
      break;
    }
    code -= CharCode._0;
    if (<u32>code >= 10) break;
    num = (num * 10) + code;
    ptr += 2;
  }
  return sign * num;
}
