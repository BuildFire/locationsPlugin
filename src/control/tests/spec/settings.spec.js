import "../lib/jasmine";
import "../lib/jasmine-html";
import "../lib/boot";

import Settings from "../../../repository/Settings";

const run = () => { 
  describe("Settings", () => {
 
    it("get settings", (done) => {
      Settings.get().then((settings) => {
        expect(Object.keys(settings).length > 0).toBeTrue();
        done();
      });
    });

    it("save settings", (done) => {
      Settings.get().then((settings) => {
        Settings.save(settings.toJSON()).then((resp) => {
          console.log(resp);
          expect(Object.keys(resp).length > 0).toBeTrue();
          done();
        });
      })
    });

  });
  
}

export default {
  run
}