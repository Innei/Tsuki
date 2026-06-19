import 'reflect-metadata';

export const RESPONSE_PASSTHROUGH_METADATA = Symbol.for('app.response.passthrough');

export function ResponsePassthrough(): ClassDecorator & MethodDecorator {
  return (target: any, propertyKey?: string | symbol) => {
    if (propertyKey === undefined) {
      Reflect.defineMetadata(RESPONSE_PASSTHROUGH_METADATA, true, target);
    } else {
      Reflect.defineMetadata(RESPONSE_PASSTHROUGH_METADATA, true, target, propertyKey);
    }
  };
}

export function isResponsePassthrough(handler: unknown, controllerClass: unknown): boolean {
  return (
    Boolean(handler && Reflect.getMetadata(RESPONSE_PASSTHROUGH_METADATA, handler as object)) ||
    Boolean(
      controllerClass &&
      Reflect.getMetadata(RESPONSE_PASSTHROUGH_METADATA, controllerClass as object),
    )
  );
}
