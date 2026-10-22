from pathlib import Path
import copy
import yaml
from jsonschema import Draft202012Validator, FormatChecker
s = yaml.safe_load(Path(__file__).with_name('openrouter.openapi.yaml').read_text())
assert s['info']['version'] == '1.0.0'
assert set(s['paths']) == {'/api/v1/ai/models', '/api/v1/ai/chat'}
for schema in s['components']['schemas'].values(): Draft202012Validator.check_schema(schema)
def validate(name, value):
    return list(Draft202012Validator({'$ref': '#/components/schemas/' + name, 'components': s['components']}, format_checker=FormatChecker()).iter_errors(value))
p = s['paths']['/api/v1/ai/chat']['post']['requestBody']['content']['application/json']['example']
assert not validate('Prompt', p)
for change in [{'modelId':'paid/model'}, {'modelId':'https://evil.example'}, {'prompt':''}, {'prompt':'x'*4001}, {'entityId':'bad'}, {'provider':{'max_price':1}}, {'apiKey':'not-accepted'}]:
    assert validate('Prompt', {**p, **change})
assert not validate('ModelId', 'openrouter/free')
for path in s['paths'].values():
    for op in path.values():
        example = op['responses']['200']['content']['application/json']['example']
        name = 'Models' if 'parameters' in op else 'Reply'
        assert not validate(name, example)
        bad = copy.deepcopy(example); bad['secret'] = 'forbidden'
        assert validate(name, bad)
print('PASS: OpenRouter contract examples, strict inputs/results and free-model IDs')
