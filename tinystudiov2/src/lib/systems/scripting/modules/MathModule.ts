import type { LuaEngine } from "wasmoon";
import type { StateScope } from "../../ScriptScheduler";
import type { ScriptContext, ScriptModule } from "../types";

export class MathModule implements ScriptModule {
    register(lua: LuaEngine, _scope: StateScope, _ctx: ScriptContext): void {
        lua.doStringSync(`
            -- Vector3
            Vector3 = {}
            Vector3.__index = Vector3

            function Vector3.new(x, y, z)
                return setmetatable({ x = x or 0, y = y or 0, z = z or 0 }, Vector3)
            end

            function Vector3:__tostring()
                return string.format("Vector3(%.4f, %.4f, %.4f)", self.x, self.y, self.z)
            end

            function Vector3.__add(a, b)
                return Vector3.new(a.x + b.x, a.y + b.y, a.z + b.z)
            end

            function Vector3.__sub(a, b)
                return Vector3.new(a.x - b.x, a.y - b.y, a.z - b.z)
            end

            function Vector3.__mul(a, b)
                if type(a) == "number" then
                    return Vector3.new(b.x * a, b.y * a, b.z * a)
                elseif type(b) == "number" then
                    return Vector3.new(a.x * b, a.y * b, a.z * b)
                end
                return Vector3.new(a.x * b.x, a.y * b.y, a.z * b.z)
            end

            function Vector3.__div(a, b)
                if type(b) == "number" then
                    return Vector3.new(a.x / b, a.y / b, a.z / b)
                end
                return Vector3.new(a.x / b.x, a.y / b.y, a.z / b.z)
            end

            function Vector3:length()
                return math.sqrt(self.x * self.x + self.y * self.y + self.z * self.z)
            end

            function Vector3:normalized()
                local len = self:length()
                if len == 0 then return Vector3.new(0, 0, 0) end
                return Vector3.new(self.x / len, self.y / len, self.z / len)
            end

            function Vector3:dot(other)
                return self.x * other.x + self.y * other.y + self.z * other.z
            end

            function Vector3:cross(other)
                return Vector3.new(
                    self.y * other.z - self.z * other.y,
                    self.z * other.x - self.x * other.z,
                    self.x * other.y - self.y * other.x
                )
            end

            function Vector3:clone()
                return Vector3.new(self.x, self.y, self.z)
            end

            function Vector3:distance(other)
                local dx = self.x - other.x
                local dy = self.y - other.y
                local dz = self.z - other.z
                return math.sqrt(dx * dx + dy * dy + dz * dz)
            end

            function Vector3:lerp(other, t)
                t = t or 0.5
                return Vector3.new(
                    self.x + (other.x - self.x) * t,
                    self.y + (other.y - self.y) * t,
                    self.z + (other.z - self.z) * t
                )
            end

            function Vector3:getYaw()
                return math.atan2(self.x, self.z)
            end

            function Vector3:setYaw(yaw)
                local lenXZ = math.sqrt(self.x * self.x + self.z * self.z)
                self.x = math.sin(yaw) * lenXZ
                self.z = math.cos(yaw) * lenXZ
                return self
            end

            function Vector3:getPitch()
                return math.atan2(self.y, math.sqrt(self.x * self.x + self.z * self.z))
            end

            function Vector3:setPitch(pitch)
                local len = self:length()
                if len == 0 then return self end
                self.y = math.sin(pitch) * len
                local lenXZ = math.cos(pitch) * len
                local yaw = self:getYaw()
                self.x = math.sin(yaw) * lenXZ
                self.z = math.cos(yaw) * lenXZ
                return self
            end

            Vector3.zero = Vector3.new(0, 0, 0)
            Vector3.one = Vector3.new(1, 1, 1)
            Vector3.up = Vector3.new(0, 1, 0)
            Vector3.down = Vector3.new(0, -1, 0)
            Vector3.right = Vector3.new(1, 0, 0)
            Vector3.left = Vector3.new(-1, 0, 0)
            Vector3.forward = Vector3.new(0, 0, -1)
            Vector3.back = Vector3.new(0, 0, 1)

            -- Vector2
            Vector2 = {}
            Vector2.__index = Vector2

            function Vector2.new(x, y)
                return setmetatable({ x = x or 0, y = y or 0 }, Vector2)
            end

            function Vector2:__tostring()
                return string.format("Vector2(%.4f, %.4f)", self.x, self.y)
            end

            function Vector2.__add(a, b)
                return Vector2.new(a.x + b.x, a.y + b.y)
            end

            function Vector2.__sub(a, b)
                return Vector2.new(a.x - b.x, a.y - b.y)
            end

            function Vector2.__mul(a, b)
                if type(a) == "number" then
                    return Vector2.new(b.x * a, b.y * a)
                elseif type(b) == "number" then
                    return Vector2.new(a.x * b, a.y * b)
                end
                return Vector2.new(a.x * b.x, a.y * b.y)
            end

            function Vector2:length()
                return math.sqrt(self.x * self.x + self.y * self.y)
            end

            -- Math extensions
            function math.clamp(val, minVal, maxVal)
                if val < minVal then return minVal end
                if val > maxVal then return maxVal end
                return val
            end

            function math.lerp(a, b, t)
                return a + (b - a) * (t or 0.5)
            end

            function math.randomRange(minVal, maxVal)
                return minVal + math.random() * (maxVal - minVal)
            end
        `);
    }
}
