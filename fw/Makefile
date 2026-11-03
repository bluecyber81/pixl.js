# Historical all/ota recipes combine legacy bootloader/settings/SoftDevice
# files. Use scripts/build_de3.sh to compile this DE application, then use the
# separately verified signed update package. No implicit combined package.
ifeq ($(strip $(MAKECMDGOALS)),)
$(error Legacy default combined build is disabled in this DE tree; use fw/scripts/build_de3.sh for application-only compilation and the separately verified signed update packages)
endif
ifneq ($(strip $(filter all ota,$(MAKECMDGOALS))),)
$(error Legacy combined all/ota targets are disabled in this DE tree; use fw/scripts/build_de3.sh for application-only compilation and the separately verified signed update packages)
endif

.PHONY: app bl clean size_report size_report_files

all: bl app ota

bl:
	@$(MAKE) -C bootloader/

app:
	@$(MAKE) -C application/

ota:
	@$(MAKE) -C application/ full ota

clean:
	@rm -rf _build/

size_report:
	@$(MAKE) -C application/ size_report

size_report_files:
	@$(MAKE) -C application/ size_report_files
