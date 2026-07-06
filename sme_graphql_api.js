// Executes a QUERY or MUTATION against the SmeApplication GraphQL Charon service.
//
// Input parameters:
//   processId  (required) – process ID of the SME application
//   operation  (required) – "QUERY" or "MUTATION"
//   fields     (required for QUERY)    – one parameter value per dot-notation field path,
//                                        e.g. "legalForm", "companyData.nip"
//   mutations  (required for MUTATION) – JSON array string of FieldMutation objects,
//                                        e.g. [{"path":"legalForm","value":"SP_Z_OO"}]
//
// Output (SmeApplicationGraphQLServiceOutput):
//   success        – "true" / "false" – whether the operation completed without errors
//   data           – JSON string of Map<fieldPath, value>; populated for QUERY operations
//   errors         – comma-separated error messages; populated when success=false
//   technicalError – set when the Charon proxy itself fails (transport/mapping error)
function callService(context) {
    const GRAPHQL_SERVICE = "ca-sme-SmeApplicationGraphQLServiceProxy";
    const OPERATION_QUERY = "QUERY";
    const OPERATION_MUTATION = "MUTATION";

    const processId = context.getFirstParameter('processId');
    const operation = context.getFirstParameter('operation');

    if (!processId) {
        Logger.error('Missing required parameter: processId');
        return [{ 'output': null, 'technicalError': 'Missing required parameter: processId' }];
    }

    if (operation !== OPERATION_QUERY && operation !== OPERATION_MUTATION) {
        Logger.error('Invalid or missing operation parameter, got: {}', operation);
        return [{ 'output': null, 'technicalError': 'Invalid operation: expected QUERY or MUTATION' }];
    }

    const requestInput = {
        processId: [processId],
        operation: [operation]
    };

    if (operation === OPERATION_QUERY) {
        const fields = context.getParameters('fields');
        if (!fields || fields.size() === 0) {
            Logger.error('Missing required parameter for QUERY: fields');
            return [{ 'output': null, 'technicalError': 'Missing required parameter: fields' }];
        }
        requestInput.fields = fields;
    }

    if (operation === OPERATION_MUTATION) {
        const mutationsRaw = context.getFirstParameter('mutations');
        if (!mutationsRaw) {
            Logger.error('Missing required parameter for MUTATION: mutations');
            return [{ 'output': null, 'technicalError': 'Missing required parameter: mutations' }];
        }
        try {
            JSON.parse(mutationsRaw);
        } catch (error) {
            Logger.error('Failed to parse mutations JSON: {}', error);
            return [{ 'output': null, 'technicalError': 'Invalid mutations JSON' }];
        }
        requestInput.mutations = [mutationsRaw];
    }

    let rawResponse;
    try {
        rawResponse = context.callService(GRAPHQL_SERVICE, requestInput).get(0);
    } catch (error) {
        Logger.error('GraphQL service call failed: {}', error);
        return [{ 'success': 'false', 'data': null, 'errors': null, 'technicalError': 'Service call failed' }];
    }

    if (rawResponse === null || rawResponse === undefined) {
        Logger.error('GraphQL service returned null response');
        return [{ 'success': 'false', 'data': null, 'errors': null, 'technicalError': 'Service returned null response' }];
    }

    const technicalError = rawResponse.get('technicalError');
    if (technicalError) {
        Logger.error('GraphQL service returned a technical error: {}', technicalError);
        return [{ 'success': 'false', 'data': null, 'errors': null, 'technicalError': technicalError }];
    }

    const success = rawResponse.get('success');
    const data = rawResponse.get('data');
    const errors = rawResponse.get('errors');

    if (success !== true && success !== 'true') {
        Logger.error('GraphQL operation failed, errors: {}', errors);
        return [{ 'success': 'false', 'data': null, 'errors': errors }];
    }

    return [{ 'success': 'true', 'data': data, 'errors': null }];
}
