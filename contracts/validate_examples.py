"""JSON schema example checks; real PostgreSQL/HTTP checks belong to backend tests."""
from pathlib import Path
import yaml
from jsonschema import Draft202012Validator, FormatChecker

doc = yaml.safe_load(Path(__file__).with_name('openapi.yaml').read_text())
assert doc['openapi'] == '3.1.1' and doc['info']['version'] == '1.0.0'

def validator(schema):
    root = {**schema, 'components': doc['components']}
    Draft202012Validator.check_schema(root)
    return Draft202012Validator(root, format_checker=FormatChecker())

count = 0
def walk(node):
    global count
    if isinstance(node, dict):
        if 'schema' in node and 'example' in node:
            validator(node['schema']).validate(node['example']); count += 1
        for value in node.values(): walk(value)
    elif isinstance(node, list):
        for value in node: walk(value)
walk(doc)
assert count >= 10
s = doc['components']['schemas']
validator(s['ChecklistTaskList']).validate({'items': [], 'summary': {'total': 0, 'completed': 0, 'percent': 0}})
for value in [{'completed':'true','expectedVersion':1}, {'completed':True,'expectedVersion':0}, {'completed':True,'expectedVersion':1,'role':'Admin'}]:
    assert list(validator(s['SetChecklistCompletion']).iter_errors(value))
assert set(doc['paths']) == {'/api/v1/entities', '/api/v1/checklist-tasks', '/api/v1/checklist-tasks/{id}'}
assert 'delete' in doc['paths']['/api/v1/checklist-tasks/{id}']
print(f'PASS: {count} examples, empty summary, rejected patch payloads, frozen routes')
