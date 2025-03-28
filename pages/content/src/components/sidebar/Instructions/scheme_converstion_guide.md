Schema Notation Table

**Notation** | **Meaning** | **Example** | **Explanation**
------- | -------- | -------- | --------
o | Object | o {p {name:s}} | Indicates the schema represents a JSON object.
p {} | Contains the object's properties. | |
p {} | Properties block | p {name:s; age:i} | Defines the properties of an object, with each property separated by ;.
s | String | name:s | Represents a string type.
i | Integer | age:i | Represents an integer type.
n | Number | score:n | Represents a number type (integer or float).
b | Boolean | active:b | Represents a boolean type.
a | Array | tags:a[s] | Represents an array type, with the item type specified in [ ].
e[values] | Enum | color:e["red", "green", "blue"] | Represents an enum with specific allowed values.
u[types] | Union | value:u[s, n] | Represents a union of multiple types.
lit[value] | Literal | status:lit["active"] | Represents a literal value that the field must match exactly.
r | Required | name:s r | Indicates that the property is required.
d=value | Default value | active:b d=true | Specifies a default value for the property.
ap f | Additional properties false | o {p {name:s} ap f} | Disallows additional properties not defined in the schema.
type(key=value, ...) | Constrained type | name:s(minLength=1) | Adds constraints to a type, e.g., minLength for strings or min for numbers.
a[type] | Array with item type | tags:a[s] | Specifies an array where each item is of type s (string).
o {p {prop:type}} | Nested object | user:o {p {id:i; name:s}} | Represents a nested object with its own properties.
?type | Optional type | ?s | Represents an optional type, equivalent to u[type, null].
t[type1, type2, ...] | Tuple | t[s, i] | Represents a tuple with specific types for each position.
s[type] | Set | s[i] | Represents a set of unique values of type i (integer).
d[key, value] | Dictionary | d[s, i] | Represents a dictionary with keys of type s and values of type i.
ClassName | Custom class | User | Represents a custom class or type, often used for nested schemas.

* * *


Schema Notation Table

**Notation** | **Meaning** | **Example**
------- | -------- | --------
o | Object | o {p {name:s}}
p {} | Contains the object's properties. |
p {} | Properties block | p {name:s; age:i}
s | String | name:s
i | Integer | age:i
n | Number | score:n
b | Boolean | active:b
a | Array | tags:a[s]
e[values] | Enum | color:e["red", "green", "blue"]
u[types] | Union | value:u[s, n]
lit[value] | Literal | status:lit["active"]
r | Required | name:s r
d=value | Default value | active:b d=true
ap f | Additional properties false | o {p {name:s} ap f}
type(key=value, ...) | Constrained type | name:s(minLength=1)
a[type] | Array with item type | tags:a[s]
o {p {prop:type}} | Nested object | user:o {p {id:i; name:s}}
?type | Optional type | ?s
t[type1, type2, ...] | Tuple | t[s, i]
s[type] | Set | s[i]
d[key, value] | Dictionary | d[s, i]
ClassName | Custom class | User

Detailed Explanations

Basic Types

* s: A string type, e.g., "hello".
* i: An integer type, e.g., 42.
* n: A number type, which can be an integer or float, e.g., 3.14.
* b: A boolean type, e.g., true or false.
* a: An array type, where the type of items is specified in brackets, e.g., a[s] for an array of strings like ["apple", "banana"].

Complex Types

* o {p {}}: Defines a JSON object with properties listed in the p {} block, e.g., { "name": "John", "age": 30 }.
* a[type]: An array where all items share the same type, e.g., tags:a[s] for ["tag1", "tag2"].
* e[values]: An enum restricting values to a predefined list, e.g., color:e["red", "green", "blue"].
* u[types]: A union allowing multiple types, e.g., value:u[s, n] could be "text" or 123.
* lit[value]: A literal that must match exactly, e.g., status:lit["active"] only allows "active".

Modifiers

* r: Marks a property as required, meaning it cannot be omitted, e.g., name:s r.
* d=value: Sets a default value if the property is not provided, e.g., active:b d=true.
* ap f: Prevents additional properties in an object, e.g., o {p {name:s} ap f} rejects { "name": "John", "extra": 1 }.

Constraints

* Constraints are added in parentheses after a type, e.g., s(minLength=1) ensures a string is at least 1 character long.
* Examples: i(min=0) for non-negative integers, n(max=100) for numbers up to 100.

Nested Structures

* o {p {prop:type}}: Allows nesting, e.g., user:o {p {id:i; name:s}} for { "id": 1, "name": "John" }.
* Arrays can hold complex types, e.g., a[o {p {name:s}}] for [{ "name": "John" }, { "name": "Jane" }].

Special Types

* ?type: An optional type that can be the specified type or null, e.g., ?s for "text" or null.
* t[type1, type2, ...]: A tuple with fixed positions, e.g., t[s, i] for ["text", 42].
* s[type]: A set of unique values, e.g., s[i] for {1, 2, 3} (no duplicates).
* d[key, value]: A dictionary, e.g., d[s, i] for { "age": 30, "score": 95 }.

Custom Types

* ClassName: Refers to a custom-defined type or class, e.g., User might represent a complex schema defined elsewhere.

* * *

Example Usage

* Simple Object:
    * Notation: o {p {name:s r; age:i}}
    * Meaning: An object with a required name (string) and an optional age (integer), e.g., { "name": "John", "age": 25 }.

* Array with Constraints:
    * Notation: a[s(minLength=1)]
    * Meaning: An array of strings, each at least 1 character, e.g., ["cat", "dog"].

* Enum:
    * Notation: color:e["red", "green", "blue"]
    * Meaning: A color property limited to "red", "green", or "blue".

* Union:
    * Notation: value:u[s, n]
    * Meaning: A value that can be a string or number, e.g., "hello" or 42.

* Literal:
    * Notation: status:lit["active"]
    * Meaning: A status that must be "active".

* Default Value:
    * Notation: active:b d=true
    * Meaning: A boolean active that defaults to true if not specified.

* Disallow Additional Properties:
    * Notation: o {p {name:s} ap f}
    * Meaning: An object with only a name property, rejecting extras, e.g., { "name": "John" } is valid, but { "name": "John", "age": 30 } is not.